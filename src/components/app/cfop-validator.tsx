
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
import { cleanAndToStr } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ScrollArea } from '../ui/scroll-area';
import { cfopDescriptions } from '@/lib/cfop';
import { CardDescription } from '../ui/card';

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

interface CfopValidatorProps {
    items: CfopValidationData[];
    allPersistedClassifications: AllClassifications;
    onPersistAllClassifications: (allData: AllClassifications) => void;
}

const getUniqueProductKey = (item: CfopValidationData): string => {
    // Usa o Código do produto do XML e o CNPJ do emitente
    return `${cleanAndToStr(item['CPF/CNPJ do Emitente'])}-${cleanAndToStr(item['Código'])}`;
};

const getBaseCfop = (cfop: string): string => {
    if (!cfop || cfop.length !== 4) return cfop;
    const firstDigit = cfop.charAt(0);
    const rest = cfop.substring(1);
    if (['2', '3'].includes(firstDigit)) {
        return `1${rest}`;
    }
    if (['6', '7'].includes(firstDigit)) {
        return `5${rest}`;
    }
    return cfop;
}


export function CfopValidator({ items, allPersistedClassifications, onPersistAllClassifications }: CfopValidatorProps) {
    const { toast } = useToast();
    const [validationStatus, setValidationStatus] = useState<Record<string, ValidationStatus>>({});
    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => {
        const initialStatus: Record<string, ValidationStatus> = {};
        const persistedValidations = (allPersistedClassifications && allPersistedClassifications['cfopValidations']?.classifications) || {};

        items.forEach(item => {
            const uniqueProductKey = getUniqueProductKey(item);
            initialStatus[item['Chave de acesso'] + item.Item] = persistedValidations[uniqueProductKey]?.classification as ValidationStatus || 'unvalidated';
        });
        setValidationStatus(initialStatus);
        setHasChanges(false);
    }, [items, allPersistedClassifications]);

    const handleValidationChange = (item: CfopValidationData, newStatus: ValidationStatus) => {
        const uniqueProductKey = getUniqueProductKey(item);
        
        const newValidationStatus = { ...validationStatus };
        
        // Propagate the change to all items with the same product key
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

    const groupedItems = useMemo(() => {
        const pending: Record<string, CfopValidationData[]> = {};
        const validated: Record<string, CfopValidationData[]> = {};
        
        items.forEach(item => {
            const status = validationStatus[item['Chave de acesso'] + item.Item] || 'unvalidated';
            const itemWithStatus = { ...item, validationStatus: status };
            const siengeCfop = item.Sienge_CFOP || 'N/A';
            const baseCfop = getBaseCfop(siengeCfop);

            if (status === 'unvalidated') {
                if (!pending[baseCfop]) pending[baseCfop] = [];
                pending[baseCfop].push(itemWithStatus);
            } else {
                 if (!validated[baseCfop]) validated[baseCfop] = [];
                validated[baseCfop].push(itemWithStatus);
            }
        });
        return { pending, validated };
    }, [items, validationStatus]);


    const columns = getColumnsWithCustomRender(
        items,
        ['Número da Nota', 'Fornecedor', 'Descrição', 'Sienge_Descrição', 'CFOP', 'CST do ICMS', 'Sienge_CFOP'],
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

    const renderGroupedTabs = (data: Record<string, CfopValidationData[]>, baseColumns: ColumnDef<CfopValidationData, any>[]) => {
        const cfopKeys = Object.keys(data).sort();
        if (cfopKeys.length === 0) {
            return <div className="text-center p-8 text-muted-foreground">Nenhum item para exibir.</div>;
        }

        return (
             <Tabs defaultValue={cfopKeys[0]} className="w-full">
                <TabsList className="h-auto flex-wrap justify-start">
                    {cfopKeys.map(cfop => (
                        <TabsTrigger key={cfop} value={cfop}>
                            CFOP {cfop} ({data[cfop].length})
                        </TabsTrigger>
                    ))}
                </TabsList>
                {cfopKeys.map(cfop => (
                    <TabsContent key={cfop} value={cfop} className="mt-4">
                        <div className='mb-4 p-2 border-l-4 border-primary bg-muted/50'>
                             <h3 className="text-lg font-semibold">CFOP {cfop}</h3>
                             <CardDescription>{cfopDescriptions[parseInt(cfop, 10) as keyof typeof cfopDescriptions] || 'Descrição não encontrada'}</CardDescription>
                        </div>
                        <DataTable columns={baseColumns} data={data[cfop]} />
                    </TabsContent>
                ))}
            </Tabs>
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
                        <TabsTrigger value="pending">Pendentes de Validação ({items.filter(it => (validationStatus[it['Chave de acesso'] + it.Item] || 'unvalidated') === 'unvalidated').length})</TabsTrigger>
                        <TabsTrigger value="validated">Validados ({items.filter(it => (validationStatus[it['Chave de acesso'] + it.Item] || 'unvalidated') !== 'unvalidated').length})</TabsTrigger>
                    </TabsList>
                     <div className='flex-grow overflow-hidden mt-4'>
                        <ScrollArea className="h-full pr-4">
                            <TabsContent value="pending" className="mt-0">
                                {renderGroupedTabs(groupedItems.pending, [...columns, actionColumn])}
                            </TabsContent>
                            <TabsContent value="validated" className="mt-0">
                                {renderGroupedTabs(groupedItems.validated, [...columns, statusColumn, actionColumn])}
                            </TabsContent>
                        </ScrollArea>
                    </div>
                </Tabs>
            </div>
        </div>
    );
}

  

    