
"use client";

import { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/lib/columns-helper";
import { ThumbsDown, ThumbsUp, RotateCcw, AlertTriangle, CheckCircle, FileWarning } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Badge } from '../ui/badge';
import type { AllClassifications } from './imobilizado-analysis';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ScrollArea } from '../ui/scroll-area';

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

type ValidationStatus = 'unvalidated' | 'correct' | 'incorrect';

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
        return cfop || 'N/A';
    }
    return cfop.substring(1);
};


export function CfopValidator({ items, allPersistedClassifications, onPersistAllClassifications }: CfopValidatorProps) {
    const { toast } = useToast();
    const [validationStatus, setValidationStatus] = useState<Record<string, ValidationStatus>>({});
    
    const [groupedItems, setGroupedItems] = useState<GroupedItems>({});

    useEffect(() => {
        const persistedValidations = (allPersistedClassifications && allPersistedClassifications['cfopValidations']?.classifications) || {};
        const initialStatus: Record<string, ValidationStatus> = {};

        items.forEach(item => {
            const uniqueProductKey = getUniqueProductKey(item);
            initialStatus[item['Chave de acesso'] + item.Item] = persistedValidations[uniqueProductKey]?.classification as ValidationStatus || 'unvalidated';
        });

        setValidationStatus(initialStatus);
    }, [items, allPersistedClassifications]);


    useEffect(() => {
        const allItemsByDescription: Record<string, CfopValidationData[]> = {};
        items.forEach(item => {
            const cfop = item.Sienge_CFOP || 'N/A';
            const baseCfop = getBaseCfop(cfop);
            
            const uniqueCfopsInGroup = new Set<string>();
            items.forEach(i => {
                if (getBaseCfop(i.Sienge_CFOP) === baseCfop) {
                    uniqueCfopsInGroup.add(i.Sienge_CFOP);
                }
            });
            const groupTitle = Array.from(uniqueCfopsInGroup).sort().join(' / ');
            
            if (!allItemsByDescription[groupTitle]) {
                allItemsByDescription[groupTitle] = [];
            }
            allItemsByDescription[groupTitle].push(item);
        });

        const finalGroups: GroupedItems = {};
        Object.entries(allItemsByDescription).forEach(([title, itemsInGroup]) => {
            finalGroups[title] = itemsInGroup.map(item => ({
                ...item,
                validationStatus: validationStatus[item['Chave de acesso'] + item.Item] || 'unvalidated'
            }));
        });

        setGroupedItems(finalGroups);
    }, [items, validationStatus]);


    const handleValidationChange = (item: CfopValidationData, newStatus: ValidationStatus) => {
        const uniqueProductKey = getUniqueProductKey(item);
        
        // Update local UI state immediately
        const newValidationStatus = { ...validationStatus };
        const itemsToUpdate = items.filter(i => getUniqueProductKey(i) === uniqueProductKey);
        itemsToUpdate.forEach(i => {
            newValidationStatus[i['Chave de acesso'] + i.Item] = newStatus;
        });
        setValidationStatus(newValidationStatus);

        // Persist the change automatically
        const updatedPersistedData = JSON.parse(JSON.stringify(allPersistedClassifications || {}));
        if (!updatedPersistedData['cfopValidations']) {
            updatedPersistedData['cfopValidations'] = { classifications: {}, accountCodes: {} };
        }
        
        if (newStatus !== 'unvalidated') {
             updatedPersistedData['cfopValidations'].classifications[uniqueProductKey] = { classification: newStatus };
        } else {
            // If reverting to unvalidated, remove it from persisted data
            delete updatedPersistedData['cfopValidations'].classifications[uniqueProductKey];
        }

        onPersistAllClassifications(updatedPersistedData);
        
        toast({
            title: `Item classificado como "${newStatus}"`,
            description: "A sua alteração foi guardada automaticamente."
        });
    };
    
    const columns = getColumnsWithCustomRender(
        items,
        ['Fornecedor', 'Número da Nota', 'Descrição', 'Sienge_Descrição', 'CFOP', 'CST do ICMS', 'Sienge_CFOP'],
        (row: any, id: string) => {
            const value = row.getValue(id);
             if (id === 'Fornecedor') {
                return (
                    <div className="max-w-[200px] truncate" title={row.original.Fornecedor}>
                        <p>{row.original.Fornecedor}</p>
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
    );

    const actionColumn: any = {
        id: 'Ações',
        header: 'Ações',
        cell: ({ row }: any) => {
            const item = row.original;
            return (
                <TooltipProvider>
                    <div className="flex gap-2 justify-center">
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant={item.validationStatus === 'correct' ? 'default' : 'ghost'} className="h-8 w-8" onClick={() => handleValidationChange(item, 'correct')}><ThumbsUp className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Marcar como Correto</p></TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant={item.validationStatus === 'incorrect' ? 'destructive' : 'ghost'} className="h-8 w-8" onClick={() => handleValidationChange(item, 'incorrect')}><ThumbsDown className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Marcar como Incorreto</p></TooltipContent></Tooltip>
                        {item.validationStatus !== 'unvalidated' && (
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
            const { validationStatus } = row.original;
            switch(validationStatus) {
                case 'correct': return <Badge variant="default" className='bg-green-600 hover:bg-green-700'><CheckCircle className="h-4 w-4 mr-1" /> Correto</Badge>;
                case 'incorrect': return <Badge variant="destructive"><AlertTriangle className="h-4 w-4 mr-1" /> Incorreto</Badge>;
                default: return <Badge variant="secondary"><FileWarning className="h-4 w-4 mr-1" /> Pendente</Badge>;
            }
        }
    };

    const renderGroupedContent = () => {
        const descriptionKeys = Object.keys(groupedItems).sort();

        if (descriptionKeys.length === 0) {
            return <div className="text-center p-8 text-muted-foreground">Nenhum item para exibir.</div>;
        }

        const columnsToRender = [...columns, statusColumn, actionColumn];

        return (
             <ScrollArea className="h-full pr-4">
                 <Tabs defaultValue={descriptionKeys[0]} orientation="vertical">
                    <TabsList>
                        {descriptionKeys.map(title => (
                            <TabsTrigger key={title} value={title} className="w-full justify-start text-left h-auto py-2">
                                <p className="font-semibold">{title}</p>
                            </TabsTrigger>
                        ))}
                    </TabsList>
                     {descriptionKeys.map(title => {
                        const itemsInGroup = groupedItems[title];
                        return (
                             <TabsContent key={title} value={title} className="mt-0 pl-4">
                                <DataTable columns={columnsToRender} data={itemsInGroup} />
                            </TabsContent>
                        )
                    })}
                </Tabs>
            </ScrollArea>
        )
    };


    return (
        <div className="space-y-4 h-full flex flex-col">
            <div className="flex-grow overflow-hidden">
                {renderGroupedContent()}
            </div>
        </div>
    );
}

