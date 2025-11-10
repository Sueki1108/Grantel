
"use client";

import * as React from "react";
import { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/lib/columns-helper";
import { EyeOff, AlertTriangle, RotateCcw } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { CfopValidationData } from './cfop-validator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";


interface DifalTabProps {
    reconciledItems: CfopValidationData[];
    cfopValidations: {
        [uniqueProductKey: string]: {
            classification: 'correct' | 'incorrect' | 'verify';
        };
    };
}

const getUniversalProductKey = (item: CfopValidationData): string => {
    const siengeCfop = item['Sienge_CFOP'] || '';
    return `${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}-${siengeCfop}`;
};

const getItemLineKey = (item: CfopValidationData): string => {
    return item['Chave de acesso'] + item.Item;
};


export function DifalTab({ reconciledItems, cfopValidations }: DifalTabProps) {
    const [disregardedItems, setDisregardedItems] = useState<Set<string>>(new Set());

    const difalItems = useMemo(() => {
        return reconciledItems.filter(item => {
            if (!item) return false;
            
            const uniqueProductKey = getUniversalProductKey(item);
            const cfopStatus = cfopValidations[uniqueProductKey]?.classification;
            
            const isDifalCfop = item.Sienge_CFOP === '2551' || item.Sienge_CFOP === '2556';
            
            return cfopStatus === 'correct' && isDifalCfop;
        });
    }, [reconciledItems, cfopValidations]);
    
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
                                    {isDisregarded ? <RotateCcw className="h-4 w-4 text-green-600" /> : <EyeOff className="h-4 w-4" />}
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
                <CardTitle>Análise de Itens para DIFAL</CardTitle>
                <CardDescription>Itens com CFOP Sienge 2551 ou 2556 validados como "Corretos" na conciliação. Use a ação para mover itens para a lista de desconsiderados.</CardDescription>
            </CardHeader>
            <CardContent>
                 <Tabs defaultValue="main">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="main">Itens para DIFAL ({mainItems.length})</TabsTrigger>
                        <TabsTrigger value="disregarded">Itens Desconsiderados ({ignoredItems.length})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="main" className="mt-4">
                        {mainItems.length > 0 ? (
                            <DataTable columns={columns} data={mainItems} />
                        ) : (
                             <div className="text-center p-8 text-muted-foreground">
                                <AlertTriangle className="mx-auto h-12 w-12 mb-4" />
                                <h3 className="text-xl font-semibold">Nenhum item encontrado</h3>
                                <p>Não foram encontrados itens conciliados com CFOP 2551/2556 e status "Correto".</p>
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
