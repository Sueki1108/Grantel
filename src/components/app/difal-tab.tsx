
"use client";

import * as React from "react";
import { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/lib/columns-helper";
import { EyeOff, AlertTriangle, RotateCw, Search } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { CfopValidationData } from './cfop-validator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { AllClassifications } from "./imobilizado-analysis";
import { cfopDescriptions } from "@/lib/cfop";


interface DifalTabProps {
    reconciledItems: CfopValidationData[];
    allPersistedClassifications: AllClassifications;
}

const getUniversalProductKey = (item: CfopValidationData): string => {
    const siengeCfop = item['Sienge_CFOP'] || '';
    const fullDescription = getFullCfopDescription(siengeCfop).toLowerCase();
    return `${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}-${fullDescription}`;
};

const getItemLineKey = (item: CfopValidationData): string => {
    return item['Chave de acesso'] + item.Item;
};

// Re-use cfopDescriptions from cfop.ts as it's not exported from cfop-validator
const getFullCfopDescription = (cfopCode: string | number): string => {
    const code = parseInt(String(cfopCode), 10);
    return cfopDescriptions[code as keyof typeof cfopDescriptions] || "Descrição não encontrada";
};


export function DifalTab({ reconciledItems, allPersistedClassifications }: DifalTabProps) {
    const [disregardedItems, setDisregardedItems] = useState<Set<string>>(new Set());
    const [difalItems, setDifalItems] = useState<CfopValidationData[]>([]);

    const findDifalItems = () => {
        const items = reconciledItems.filter(item => {
            if (!item) return false;

            const universalProductKey = getUniversalProductKey(item);
            let isCorrect = false;

            // Search through all competences for a 'correct' classification
            for (const competence in allPersistedClassifications) {
                const classification = allPersistedClassifications[competence]?.cfopValidations?.classifications?.[universalProductKey]?.classification;
                if (classification === 'correct') {
                    isCorrect = true;
                    break;
                }
            }

            const isDifalCfop = item.Sienge_CFOP === '2551' || item.Sienge_CFOP === '2556';
            
            return isCorrect && isDifalCfop;
        });
        setDifalItems(items);
    };

    
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
                        <CardTitle>Análise de Itens para DIFAL</CardTitle>
                        <CardDescription>Itens com CFOP Sienge 2551 ou 2556 validados como "Corretos" na conciliação. Use a ação para mover itens para a lista de desconsiderados.</CardDescription>
                    </div>
                     <Button onClick={findDifalItems}>
                        <Search className="mr-2 h-4 w-4" /> Buscar Itens para DIFAL
                    </Button>
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
                                <p>Clique no botão "Buscar Itens" para popular a lista, ou verifique se há itens conciliados com CFOP 2551/2556 e status "Correto" no seu histórico de validações.</p>
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
