"use client";

import * as React from 'react';
import { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/components/app/columns-helper";
import { Check, AlertTriangle, HelpCircle, Save, X } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { RowSelectionState, Table as ReactTable } from '@tanstack/react-table';
import { Checkbox } from '../ui/checkbox';
import { AllClassifications } from './imobilizado-analysis';
import { useToast } from '@/hooks/use-toast';


type ValidationStatus = 'correct' | 'incorrect' | 'verify' | 'unvalidated';

interface ReconciledItem extends Record<string, any> {
    'Chave de acesso': string;
    'Item': string;
    'CFOP': string;
    'Sienge_CFOP': string;
    'Descrição': string;
    'uniqueProductKey': string; // Combinação de CNPJ do emitente e código do produto
}

interface CfopValidatorProps {
    reconciledData: any[];
    competence: string | null;
    allPersistedClassifications: AllClassifications;
    onPersistAllClassifications: (allData: AllClassifications) => void;
}

const getStatusStyles = (status: ValidationStatus) => {
    switch (status) {
        case 'correct': return "text-green-600";
        case 'incorrect': return "text-red-600";
        case 'verify': return "text-amber-600";
        default: return "text-muted-foreground";
    }
};

const getStatusIcon = (status: ValidationStatus) => {
    switch (status) {
        case 'correct': return <Check className="h-5 w-5" />;
        case 'incorrect': return <X className="h-5 w-5" />;
        case 'verify': return <AlertTriangle className="h-5 w-5" />;
        default: return <HelpCircle className="h-5 w-5" />;
    }
}


export function CfopValidator({ reconciledData, competence, allPersistedClassifications, onPersistAllClassifications }: CfopValidatorProps) {
    const { toast } = useToast();
    const tableRef = React.useRef<ReactTable<ReconciledItem> | null>(null);
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

    const [classifications, setClassifications] = useState<Record<string, { classification: ValidationStatus, isDifal: boolean }>>({});
    const [hasChanges, setHasChanges] = useState(false);

    const itemsToValidate = useMemo((): ReconciledItem[] => {
        return reconciledData.map(item => ({
            ...item,
            uniqueProductKey: `${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}-${item.Sienge_CFOP}`
        }));
    }, [reconciledData]);

     useEffect(() => {
        if (!competence) return;
        const initialClassifications: Record<string, { classification: ValidationStatus, isDifal: boolean }> = {};
        
        itemsToValidate.forEach(item => {
            const key = item.uniqueProductKey;
            const persistedClassification = allPersistedClassifications[competence]?.cfopValidations?.classifications?.[key];
            if (persistedClassification) {
                initialClassifications[key] = persistedClassification;
            } else {
                 initialClassifications[key] = { classification: 'unvalidated', isDifal: false };
            }
        });

        setClassifications(initialClassifications);
        setHasChanges(false);
        setRowSelection({});
    }, [itemsToValidate, competence, allPersistedClassifications]);

    
    const handleStatusChange = (itemsToChange: ReconciledItem[], newStatus: ValidationStatus) => {
        setClassifications(prev => {
            const newClassifications = { ...prev };
            itemsToChange.forEach(item => {
                newClassifications[item.uniqueProductKey] = {
                    ...(newClassifications[item.uniqueProductKey] || { classification: 'unvalidated', isDifal: false }),
                    classification: newStatus
                };
            });
            return newClassifications;
        });
        setHasChanges(true);
    };

    const handleDifalChange = (itemsToChange: ReconciledItem[], isDifal: boolean) => {
         setClassifications(prev => {
            const newClassifications = { ...prev };
            itemsToChange.forEach(item => {
                newClassifications[item.uniqueProductKey] = {
                    ...(newClassifications[item.uniqueProductKey] || { classification: 'unvalidated', isDifal: false }),
                    isDifal: isDifal
                };
            });
            return newClassifications;
        });
        setHasChanges(true);
    };

    const handleBulkAction = (action: 'correct' | 'incorrect' | 'verify' | 'difal_true' | 'difal_false') => {
        const selectedItems = tableRef.current?.getFilteredSelectedRowModel().rows.map(row => row.original) || [];
        if (selectedItems.length === 0) {
            toast({ title: "Nenhum item selecionado", variant: 'destructive' });
            return;
        }

        if (action.startsWith('difal')) {
            handleDifalChange(selectedItems, action === 'difal_true');
        } else {
            handleStatusChange(selectedItems, action as ValidationStatus);
        }
        setRowSelection({});
    };

    const handleSaveChanges = () => {
        if (!competence) return;

        const updatedPersistedData = JSON.parse(JSON.stringify(allPersistedClassifications));
        if (!updatedPersistedData[competence]) {
            updatedPersistedData[competence] = {};
        }
        if (!updatedPersistedData[competence].cfopValidations) {
            updatedPersistedData[competence].cfopValidations = { classifications: {} };
        }

        Object.assign(updatedPersistedData[competence].cfopValidations.classifications, classifications);

        onPersistAllClassifications(updatedPersistedData);
        setHasChanges(false);
        toast({ title: 'Validações de CFOP guardadas!' });
    };

    const columns = useMemo(() => {
        const baseCols = getColumnsWithCustomRender(
            itemsToValidate,
            ['Fornecedor', 'Número da Nota', 'Descrição', 'CFOP', 'Sienge_CFOP'],
            (row, id) => <div className="truncate max-w-xs">{String(row.original[id as keyof ReconciledItem] || '')}</div>
        );

        return [
            {
                id: 'select',
                header: ({ table }) => <Checkbox checked={table.getIsAllPageRowsSelected()} onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)} aria-label="Selecionar todas" />,
                cell: ({ row }) => <Checkbox checked={row.getIsSelected()} onCheckedChange={(value) => row.toggleSelected(!!value)} aria-label="Selecionar linha" />,
                enableSorting: false,
            },
            ...baseCols,
             {
                id: 'status',
                header: 'Status da Validação',
                cell: ({ row }) => {
                    const status = classifications[row.original.uniqueProductKey]?.classification || 'unvalidated';
                    return <div className={`flex items-center gap-2 font-medium ${getStatusStyles(status)}`}>{getStatusIcon(status)} {status}</div>;
                }
            },
             {
                id: 'isDifal',
                header: 'É DIFAL?',
                cell: ({ row }) => {
                    const isDifal = classifications[row.original.uniqueProductKey]?.isDifal || false;
                    return <div className='flex justify-center'>{isDifal ? <Check className="h-5 w-5 text-blue-600" /> : <X className="h-5 w-5 text-muted-foreground" />}</div>;
                }
            },
            {
                id: 'actions',
                header: 'Ações Individuais',
                cell: ({ row }) => (
                     <TooltipProvider>
                        <div className="flex gap-1 justify-center">
                            <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStatusChange([row.original], 'correct')}><Check className="h-5 w-5 text-green-600"/></Button></TooltipTrigger><TooltipContent><p>Marcar como Correto</p></TooltipContent></Tooltip>
                            <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStatusChange([row.original], 'incorrect')}><X className="h-5 w-5 text-red-600"/></Button></TooltipTrigger><TooltipContent><p>Marcar como Incorreto</p></TooltipContent></Tooltip>
                            <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStatusChange([row.original], 'verify')}><AlertTriangle className="h-5 w-5 text-amber-600"/></Button></TooltipTrigger><TooltipContent><p>Marcar para Verificar</p></TooltipContent></Tooltip>
                             <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDifalChange([row.original], !classifications[row.original.uniqueProductKey]?.isDifal)}><CheckSquare className="h-5 w-5 text-blue-600"/></Button></TooltipTrigger><TooltipContent><p>Alternar DIFAL</p></TooltipContent></Tooltip>
                        </div>
                    </TooltipProvider>
                )
            }
        ];
    }, [itemsToValidate, classifications, handleStatusChange, handleDifalChange]);


    if (reconciledData.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="font-headline text-2xl">Validação de CFOP</CardTitle>
                    <CardDescription>Compare os CFOPs do XML e do Sienge e classifique-os.</CardDescription>
                </CardHeader>
                <CardContent className="text-center text-muted-foreground p-8">
                    Nenhum item reconciliado para validar. Execute a conciliação na aba anterior.
                </CardContent>
            </Card>
        );
    }
    
    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                     <div className='flex items-center gap-3'>
                        <CheckSquare className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="font-headline text-2xl">Validação de CFOP</CardTitle>
                            <CardDescription>Compare os CFOPs do XML com os do Sienge e valide cada item.</CardDescription>
                        </div>
                    </div>
                     <div className="flex items-center gap-2">
                         <Button onClick={handleSaveChanges} disabled={!hasChanges}><Save className="mr-2 h-4 w-4"/> Guardar Validações</Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="mb-4 p-3 border rounded-lg bg-muted/50 flex flex-wrap items-center gap-4">
                    <span className="text-sm font-medium">Ações em Lote:</span>
                    <Button size="sm" variant="secondary" onClick={() => handleBulkAction('correct')}><Check className="mr-2 h-4 w-4 text-green-600"/>Marcar como Correto</Button>
                    <Button size="sm" variant="secondary" onClick={() => handleBulkAction('incorrect')}><X className="mr-2 h-4 w-4 text-red-600"/>Marcar como Incorreto</Button>
                    <Button size="sm" variant="secondary" onClick={() => handleBulkAction('verify')}><AlertTriangle className="mr-2 h-4 w-4 text-amber-600"/>Marcar para Verificar</Button>
                    <div className="h-6 border-l" />
                    <Button size="sm" variant="secondary" onClick={() => handleBulkAction('difal_true')}><CheckSquare className="mr-2 h-4 w-4 text-blue-600"/>Marcar como DIFAL</Button>
                    <Button size="sm" variant="secondary" onClick={() => handleBulkAction('difal_false')}><CheckSquare className="mr-2 h-4 w-4"/>Desmarcar DIFAL</Button>
                </div>
                 <DataTable 
                    columns={columns} 
                    data={itemsToValidate} 
                    tableRef={tableRef}
                    rowSelection={rowSelection}
                    setRowSelection={setRowSelection}
                />
            </CardContent>
        </Card>
    );
}
