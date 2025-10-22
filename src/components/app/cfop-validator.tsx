"use client";

import { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/lib/columns-helper";
import { ThumbsDown, ThumbsUp, RotateCcw, AlertTriangle, CheckCircle, FileWarning, Search } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Badge } from '../ui/badge';
import type { AllClassifications } from './imobilizado-analysis';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';


// Tipos
export interface CfopValidationData extends Record<string, any> {
    'Chave de acesso': string;
    'Número da Nota': string;
    'CPF/CNPJ do Emitente': string;
    'Código': string; // Código do produto no XML
    'Sienge_CFOP': string; // CFOP do Sienge
    'Sienge_Descrição': string;
    'Fornecedor': string; // Nome do fornecedor do XML
    'Descrição': string; // Descrição do item no XML
    'CFOP': string; // CFOP do XML
    'CST do ICMS'?: string; // CST do ICMS do XML
}

type ValidationStatus = 'unvalidated' | 'correct' | 'incorrect' | 'verify';

interface GroupedItems {
  [groupTitle: string]: CfopValidationData[];
}


interface CfopValidatorProps {
    items: CfopValidationData[];
    allPersistedClassifications: AllClassifications;
    onPersistAllClassifications: (allData: AllClassifications) => void;
}

const getUniqueProductKey = (item: CfopValidationData): string => {
    return `${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}`;
};

const getBaseCfop = (cfop: string): string => {
    if (!cfop || typeof cfop !== 'string' || cfop.length < 4) {
        return 'Outros';
    }
    return cfop.substring(1);
};


export function CfopValidator({ items, allPersistedClassifications, onPersistAllClassifications }: CfopValidatorProps) {
    const { toast } = useToast();
    const [validationStatus, setValidationStatus] = useState<Record<string, ValidationStatus>>({});
    const [activeFilter, setActiveFilter] = useState<ValidationStatus | 'all'>('unvalidated');

    const columnNameMap: Record<string, string> = {
        'Fornecedor': 'Fornecedor',
        'Número da Nota': 'Nota',
        'Descrição': 'Descrição XML',
        'Sienge_Descrição': 'Descrição Sienge',
        'CFOP': 'CFOP XML',
        'CST do ICMS': 'CST XML',
        'Sienge_CFOP': 'CFOP Sienge',
    };

    // Carrega o estado persistido na inicialização
    useEffect(() => {
        const persistedValidations = (allPersistedClassifications && allPersistedClassifications['cfopValidations']?.classifications) || {};
        const initialStatus: Record<string, ValidationStatus> = {};

        items.forEach(item => {
            const uniqueProductKey = getUniqueProductKey(item);
            initialStatus[item['Chave de acesso'] + item.Item] = persistedValidations[uniqueProductKey]?.classification as ValidationStatus || 'unvalidated';
        });

        setValidationStatus(initialStatus);
    }, [items, allPersistedClassifications]);


    const handleValidationChange = (item: CfopValidationData, newStatus: ValidationStatus) => {
        const uniqueProductKey = getUniqueProductKey(item);
        
        // Propaga a classificação para todos os itens com a mesma chave de produto
        const newValidationStatus = { ...validationStatus };
        const itemsToUpdate = items.filter(i => getUniqueProductKey(i) === uniqueProductKey);
        itemsToUpdate.forEach(i => {
            newValidationStatus[i['Chave de acesso'] + i.Item] = newStatus;
        });
        setValidationStatus(newValidationStatus);

        // Persiste a alteração automaticamente
        const updatedPersistedData = JSON.parse(JSON.stringify(allPersistedClassifications || {}));
        if (!updatedPersistedData['cfopValidations']) {
            updatedPersistedData['cfopValidations'] = { classifications: {}, accountCodes: {} };
        }
        
        if (newStatus !== 'unvalidated') {
             updatedPersistedData['cfopValidations'].classifications[uniqueProductKey] = { classification: newStatus };
        } else {
            delete updatedPersistedData['cfopValidations'].classifications[uniqueProductKey];
        }

        onPersistAllClassifications(updatedPersistedData);
        
        toast({
            title: `Item(ns) classificado(s) como "${newStatus}"`,
            description: "A sua alteração foi guardada automaticamente."
        });
    };
    
    // Colunas da Tabela
    const columns = useMemo(() => getColumnsWithCustomRender(
        items,
        ['Fornecedor', 'Número da Nota', 'Descrição', 'Sienge_Descrição', 'CFOP', 'CST do ICMS', 'Sienge_CFOP'],
        (row: any, id: string) => {
             const value = row.original[id];
            
             if (id === 'Fornecedor') {
                return (
                    <div className="max-w-[200px] truncate" title={value}>
                        <p>{value}</p>
                    </div>
                );
            }
             if (id === 'Descrição' || id === 'Sienge_Descrição') {
                return <div className="max-w-xs truncate" title={String(value ?? '')}>{String(value ?? '')}</div>;
            }
            if (id === 'Número da Nota') {
                 return <div className="text-center">{String(value ?? '')}</div>;
            }
            return <div>{String(value ?? '')}</div>;
        }
    ), [items]);

    const actionColumn: any = {
        id: 'Ações',
        header: 'Ações',
        cell: ({ row }: any) => {
            const item = row.original;
            const currentStatus = validationStatus[item['Chave de acesso'] + item.Item] || 'unvalidated';
            return (
                <TooltipProvider>
                    <div className="flex gap-2 justify-center">
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant={currentStatus === 'correct' ? 'default' : 'ghost'} className="h-8 w-8" onClick={() => handleValidationChange(item, 'correct')}><ThumbsUp className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Marcar como Correto</p></TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant={currentStatus === 'incorrect' ? 'destructive' : 'ghost'} className="h-8 w-8" onClick={() => handleValidationChange(item, 'incorrect')}><ThumbsDown className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Marcar como Incorreto</p></TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant={currentStatus === 'verify' ? 'secondary' : 'ghost'} className="h-8 w-8" onClick={() => handleValidationChange(item, 'verify')}><Search className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Marcar para Verificar</p></TooltipContent></Tooltip>
                        {currentStatus !== 'unvalidated' && (
                             <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleValidationChange(item, 'unvalidated')}><RotateCcw className="h-5 w-5 text-muted-foreground" /></Button></TooltipTrigger><TooltipContent><p>Reverter para Pendente</p></TooltipContent></Tooltip>
                        )}
                    </div>
                </TooltipProvider>
            );
        }
    };
    
    const statusColumn: any = {
        id: 'status',
        header: 'Status',
        cell: ({ row }: any) => {
            const currentStatus = validationStatus[row.original['Chave de acesso'] + row.original.Item] || 'unvalidated';
            switch(currentStatus) {
                case 'correct': return <Badge variant="default" className='bg-green-600 hover:bg-green-700'><CheckCircle className="h-4 w-4 mr-1" /> Correto</Badge>;
                case 'incorrect': return <Badge variant="destructive"><AlertTriangle className="h-4 w-4 mr-1" /> Incorreto</Badge>;
                 case 'verify': return <Badge variant="secondary" className='bg-amber-500 text-white hover:bg-amber-600'><Search className="h-4 w-4 mr-1" /> Verificar</Badge>;
                default: return <Badge variant="outline"><FileWarning className="h-4 w-4 mr-1" /> Pendente</Badge>;
            }
        }
    };

    const groupedItems = useMemo((): GroupedItems => {
        const groups: GroupedItems = {};
        
        items.forEach(item => {
            const baseCfop = getBaseCfop(item.Sienge_CFOP);
            const key = baseCfop;

             if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(item);
        });

        const finalGroups: GroupedItems = {};
         for (const key in groups) {
            const itemsInGroup = groups[key];
            if (itemsInGroup.length > 0) {
                 const uniqueCfopsInGroup = Array.from(new Set(itemsInGroup.map(i => i.Sienge_CFOP))).sort();
                 const groupTitle = uniqueCfopsInGroup.join(' / ');
                 finalGroups[groupTitle] = itemsInGroup;
            }
        }

        return finalGroups;
    }, [items]);
    
    const filteredItemsByTab = (tabItems: CfopValidationData[]) => {
        if (activeFilter === 'all') return tabItems;
        return tabItems.filter(item => (validationStatus[item['Chave de acesso'] + item.Item] || 'unvalidated') === activeFilter);
    };

    const fullColumns = useMemo(() => [ ...columns.map(c => ({...c, header: columnNameMap[c.id as string] || c.id})), statusColumn, actionColumn], [columns, validationStatus]);

    const sortedGroupTitles = useMemo(() => Object.keys(groupedItems).sort((a, b) => {
        const firstNumA = parseInt(a.split(' ')[0], 10);
        const firstNumB = parseInt(b.split(' ')[0], 10);
        return firstNumA - firstNumB;
    }), [groupedItems]);

    return (
        <div className="space-y-4 h-full flex flex-col">
            <Tabs defaultValue="unvalidated" value={activeFilter} onValueChange={(value) => setActiveFilter(value as any)} className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="all">Todos</TabsTrigger>
                    <TabsTrigger value="unvalidated">Pendentes</TabsTrigger>
                    <TabsTrigger value="correct">Corretos</TabsTrigger>
                    <TabsTrigger value="incorrect">Incorretos</TabsTrigger>
                    <TabsTrigger value="verify">A Verificar</TabsTrigger>
                </TabsList>
            </Tabs>
             
             <div className="flex-grow overflow-hidden">
                <Tabs defaultValue={sortedGroupTitles[0]} className="w-full">
                    <TabsList className="h-auto flex-wrap justify-start">
                         {sortedGroupTitles.map(title => (
                            <TabsTrigger key={title} value={title}>
                                {title} ({filteredItemsByTab(groupedItems[title]).length})
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {sortedGroupTitles.map(title => (
                        <TabsContent key={title} value={title} className='mt-4'>
                            <DataTable columns={fullColumns} data={filteredItemsByTab(groupedItems[title])} />
                        </TabsContent>
                    ))}
                </Tabs>
                
                {sortedGroupTitles.length === 0 && (
                     <div className="text-center p-8 text-muted-foreground">Nenhum item para exibir.</div>
                )}
            </div>
        </div>
    );
}
