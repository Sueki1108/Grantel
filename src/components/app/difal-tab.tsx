
"use client";

import * as React from "react";
import { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/lib/columns-helper";
import { EyeOff, AlertTriangle, RotateCw, TicketPercent } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { CfopValidationData, getUniversalProductKey } from './cfop-validator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { AllClassifications } from "./imobilizado-analysis";


const getItemLineKey = (item: CfopValidationData): string => {
    return item['Chave de acesso'] + item.Item;
};

interface DifalTabProps {
    reconciledItems: CfopValidationData[];
    imobilizadoItems: any[];
    allPersistedClassifications: AllClassifications;
}

export function DifalTab({ reconciledItems, imobilizadoItems, allPersistedClassifications }: DifalTabProps) {
    const [disregardedItems, setDisregardedItems] = useState<Set<string>>(new Set());

    const allItemsToConsider = useMemo(() => {
        const allItems = new Map<string, CfopValidationData>();
        
        // Adiciona itens conciliados
        (reconciledItems || []).forEach(item => {
            if (item) allItems.set(getItemLineKey(item), item);
        });
        
        // Adiciona itens de imobilizado que ainda não estão na lista
        (imobilizadoItems || []).forEach(item => {
            if (item && !allItems.has(getItemLineKey(item))) {
                allItems.set(getItemLineKey(item), item);
            }
        });
        
        return Array.from(allItems.values());
    }, [reconciledItems, imobilizadoItems]);
    
    
    const difalItems = useMemo(() => {
        const uniqueItems = new Map<string, CfopValidationData>();

        allItemsToConsider.forEach(item => {
            if (!item) return;

            const universalKey = getUniversalProductKey(item);
            let isItemMarkedAsDifal = false;

            // Itera sobre todas as competências no histórico
            for (const competence in allPersistedClassifications) {
                const classificationsForCompetence = allPersistedClassifications[competence]?.cfopValidations?.classifications;
                
                // Verifica se a classificação para este item universal existe e se isDifal é verdadeiro
                if (classificationsForCompetence && classificationsForCompetence[universalKey]?.isDifal) {
                    isItemMarkedAsDifal = true;
                    break; // Se encontrado em qualquer competência, marca como DIFAL e para a busca
                }
            }
            
            const itemLineKey = getItemLineKey(item);
            if (isItemMarkedAsDifal && !uniqueItems.has(itemLineKey)) {
                 uniqueItems.set(itemLineKey, item);
            }
        });
        
        return Array.from(uniqueItems.values());
    }, [allItemsToConsider, allPersistedClassifications]);

    
    const handleToggleDisregard = (itemKey: string) => {
        setDisregardedItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(itemKey)) {
                newSet.delete(itemKey);
            } else {
                newSet.add(itemKey);
            }
            return newSet;
        });
    };

    const mainItems = difalItems.filter(item => !disregardedItems.has(getItemLineKey(item)));
    const ignoredItems = difalItems.filter(item => disregardedItems.has(getItemLineKey(item)));

    const columns = useMemo(() => {
        const baseCols = getColumnsWithCustomRender(
            mainItems,
            ['Fornecedor', 'Número da Nota', 'Descrição', 'Sienge_CFOP', 'CFOP', 'Valor Total'],
            (row, id) => {
                if (id === 'Valor Total' && typeof row.original[id] === 'number') {
                    return <div className="text-right">{row.original[id].toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>;
                }
                return <div>{String(row.original[id] ?? '')}</div>;
            }
        );

        baseCols.push({
            id: 'actions',
            header: 'Ações',
            cell: ({ row }) => {
                const item = row.original as CfopValidationData;
                const itemKey = getItemLineKey(item);
                const isDisregarded = disregardedItems.has(itemKey);
                
                return (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleToggleDisregard(itemKey)}>
                                    {isDisregarded ? <RotateCw className="h-4 w-4 text-green-600" /> : <EyeOff className="h-4 w-4" />}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{isDisregarded ? "Reincluir na lista" : "Desconsiderar este item"}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )
            }
        });

        return baseCols;
    }, [mainItems, disregardedItems]);

    return (
        <Card>
             <CardHeader>
                <div className='flex justify-between items-start'>
                    <div>
                         <CardTitle className="flex items-center gap-2"><TicketPercent className="h-6 w-6"/>Análise de Itens para DIFAL</CardTitle>
                        <CardDescription>Itens marcados com o status "DIFAL" na validação de CFOP. Use a ação para mover itens para a lista de desconsiderados.</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                 <Tabs defaultValue="main">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="main">Itens para DIFAL ({mainItems.length})</TabsTrigger>
                        <TabsTrigger value="disregarded">Itens Desconsiderados ({ignoredItems.length})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="main" className="mt-4">
                        {difalItems.length > 0 ? (
                           mainItems.length > 0 ? (
                                <DataTable columns={columns} data={mainItems} />
                           ) : (
                                <div className="text-center p-8 text-muted-foreground">
                                    <p>Todos os itens encontrados foram movidos para a lista de desconsiderados.</p>
                                </div>
                           )
                        ) : (
                             <div className="text-center p-8 text-muted-foreground">
                                <AlertTriangle className="mx-auto h-12 w-12 mb-4" />
                                <h3 className="text-xl font-semibold">Nenhum item encontrado</h3>
                                <p>Marque itens com o status "DIFAL" na aba "Conciliação e Validação CFOP" para que eles apareçam aqui.</p>
                            </div>
                        )}
                    </TabsContent>
                     <TabsContent value="disregarded" className="mt-4">
                        {ignoredItems.length > 0 ? (
                            <DataTable columns={columns} data={ignoredItems} />
                        ) : (
                             <div className="text-center p-8 text-muted-foreground">
                                <p>Nenhum item foi desconsiderado.</p>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    )
}
