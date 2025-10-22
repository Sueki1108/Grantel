
"use client";

import { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/lib/columns-helper";
import { ThumbsDown, ThumbsUp, RotateCcw, Save, AlertTriangle, CheckCircle, FileWarning } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Badge } from '../ui/badge';
import type { AllClassifications } from './imobilizado-analysis';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ScrollArea } from '../ui/scroll-area';
import { cfopDescriptions } from '@/lib/cfop';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card';


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
    pending: Record<string, CfopValidationData[]>;
    validated: Record<string, CfopValidationData[]>;
}

interface CfopValidatorProps {
    items: CfopValidationData[];
    allPersistedClassifications: AllClassifications;
    onPersistAllClassifications: (allData: AllClassifications) => void;
}

const getUniqueProductKey = (item: CfopValidationData): string => {
    return `${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}`;
};


/**
 * Agrupa CFOPs pela sua operação base, ignorando o primeiro dígito.
 * Ex: 1128, 2128 -> '128'
 */
const getBaseCfopOperation = (cfop: string): string => {
    if (!cfop || typeof cfop !== 'string' || cfop.length !== 4) {
        return cfop || 'N/A';
    }
    return cfop.substring(1);
};


export function CfopValidator({ items, allPersistedClassifications, onPersistAllClassifications }: CfopValidatorProps) {
    const { toast } = useToast();
    const [validationStatus, setValidationStatus] = useState<Record<string, ValidationStatus>>({});
    const [hasChanges, setHasChanges] = useState(false);
    
    const [groupedItems, setGroupedItems] = useState<GroupedItems>({ pending: {}, validated: {} });

    useEffect(() => {
        const persistedValidations = (allPersistedClassifications && allPersistedClassifications['cfopValidations']?.classifications) || {};
        const initialStatus: Record<string, ValidationStatus> = {};

        items.forEach(item => {
            const uniqueProductKey = getUniqueProductKey(item);
            initialStatus[item['Chave de acesso'] + item.Item] = persistedValidations[uniqueProductKey]?.classification as ValidationStatus || 'unvalidated';
        });

        setValidationStatus(initialStatus);
        setHasChanges(false);
    }, [items, allPersistedClassifications]);


    useEffect(() => {
        // 1. Agrupar todos os itens pela DESCRIÇÃO da operação do CFOP
        const allItemsByDescription: Record<string, CfopValidationData[]> = {};
        items.forEach(item => {
            const cfop = item.Sienge_CFOP || 'N/A';
            const baseCfop = getBaseCfopOperation(cfop);
            // Pega o equivalente de entrada para ter a descrição base
            const baseCfopKey = parseInt(`1${baseCfop}`, 10);
            const description = cfopDescriptions[baseCfopKey] || `Operação ${baseCfop}`;

            if (!allItemsByDescription[description]) {
                allItemsByDescription[description] = [];
            }
            allItemsByDescription[description].push(item);
        });

        // 2. Separar em pendentes e validados
        const pending: Record<string, CfopValidationData[]> = {};
        const validated: Record<string, CfopValidationData[]> = {};

        Object.entries(allItemsByDescription).forEach(([description, itemsInGroup]) => {
            itemsInGroup.forEach(item => {
                const status = validationStatus[item['Chave de acesso'] + item.Item] || 'unvalidated';
                const itemWithStatus = { ...item, validationStatus: status };

                const groupToUpdate = status === 'unvalidated' ? pending : validated;
                
                if (!groupToUpdate[description]) {
                    groupToUpdate[description] = [];
                }
                groupToUpdate[description].push(itemWithStatus);
            });
        });

        setGroupedItems({ pending, validated });
    }, [items, validationStatus]);


    const handleValidationChange = (item: CfopValidationData, newStatus: ValidationStatus) => {
        const uniqueProductKey = getUniqueProductKey(item);
        
        const newValidationStatus = { ...validationStatus };
        
        const itemsToUpdate = items.filter(i => getUniqueProductKey(i) === uniqueProductKey);
        itemsToUpdate.forEach(i => {
            newValidationStatus[i['Chave de acesso'] + i.Item] = newStatus;
        });

        setValidationStatus(newValidationStatus);
        setHasChanges(true);
    };

    const handleSaveChanges = () => {
        const updatedPersistedData = JSON.parse(JSON.stringify(allPersistedClassifications || {}));
        if (!updatedPersistedData['cfopValidations']) {
            updatedPersistedData['cfopValidations'] = { classifications: {}, accountCodes: {} };
        }

        Object.entries(validationStatus).forEach(([itemKey, status]) => {
            const item = items.find(i => (i['Chave de acesso'] + i.Item) === itemKey);
            if (item && status !== 'unvalidated') {
                const uniqueProductKey = getUniqueProductKey(item);
                updatedPersistedData['cfopValidations'].classifications[uniqueProductKey] = { classification: status };
            }
        });

        onPersistAllClassifications(updatedPersistedData);
        setHasChanges(false);
        toast({ title: 'Validações Guardadas', description: 'As suas validações de CFOP foram guardadas.' });
    };


    const columns = getColumnsWithCustomRender(
        items,
        ['Fornecedor', 'Número da Nota', 'Descrição', 'Sienge_Descrição', 'CFOP', 'CST do ICMS', 'Sienge_CFOP'],
        (row: any, id: string) => {
             if (id === 'Fornecedor') {
                return (
                    <div className="max-w-xs truncate" title={row.original.Fornecedor}>
                        <p>{row.original.Fornecedor}</p>
                        <p className="text-xs text-muted-foreground">{row.original['CPF/CNPJ do Emitente']}</p>
                    </div>
                );
            }
             if (id === 'Descrição' || id === 'Sienge_Descrição') {
                return <div className="max-w-xs truncate" title={row.getValue(id)}>{String(row.getValue(id) ?? '')}</div>;
            }
            return <div>{String(row.getValue(id) ?? '')}</div>;
        }
    );

    const actionColumn: any = {
        id: 'actions',
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

    const renderGroupedContent = (dataGroups: Record<string, CfopValidationData[]>, isPendingTab: boolean) => {
        const descriptionKeys = Object.keys(dataGroups).sort();

        if (descriptionKeys.length === 0) {
            return <div className="text-center p-8 text-muted-foreground">Nenhum item para exibir.</div>;
        }

        const columnsToRender = isPendingTab ? [...columns, actionColumn] : [...columns, statusColumn, actionColumn];

        return (
             <ScrollArea className="h-full pr-4">
                 <Tabs defaultValue={descriptionKeys[0]} orientation="vertical">
                    <TabsList>
                        {descriptionKeys.map(description => {
                            const itemsInGroup = dataGroups[description];
                             const uniqueCfops = Array.from(new Set(itemsInGroup.map(i => i.Sienge_CFOP))).sort().join(' / ');
                            return (
                                <TabsTrigger key={description} value={description} className="w-full justify-start text-left h-auto py-2">
                                     <div>
                                        <p className="font-semibold">{uniqueCfops}</p>
                                        <p className="text-xs text-muted-foreground font-normal">{description}</p>
                                    </div>
                                </TabsTrigger>
                            )
                        })}
                    </TabsList>
                     {descriptionKeys.map(description => {
                        const itemsInGroup = dataGroups[description];
                        return (
                             <TabsContent key={description} value={description} className="mt-0 pl-4">
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
            <div className="flex justify-end">
                <Button onClick={handleSaveChanges} disabled={!hasChanges}>
                    <Save className="mr-2 h-4 w-4" /> Guardar Validações
                </Button>
            </div>
            <div className="flex-grow overflow-hidden">
                 <Tabs defaultValue="pending" className="w-full h-full flex flex-col">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="pending">Pendentes de Validação ({Object.values(groupedItems.pending).flat().length})</TabsTrigger>
                        <TabsTrigger value="validated">Validados ({Object.values(groupedItems.validated).flat().length})</TabsTrigger>
                    </TabsList>
                     <div className='flex-grow overflow-hidden mt-4'>
                        <TabsContent value="pending" className="mt-0 h-full">
                            {renderGroupedContent(groupedItems.pending, true)}
                        </TabsContent>
                        <TabsContent value="validated" className="mt-0 h-full">
                            {renderGroupedContent(groupedItems.validated, false)}
                        </TabsContent>
                    </div>
                </Tabs>
            </div>
        </div>
    );
}


    