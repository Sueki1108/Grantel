"use client";

import * as React from 'react';
import { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/components/app/columns-helper";
import { Check, AlertTriangle, Save, X, ListFilter, RotateCw, CheckSquare, HardHat, Factory, Wrench } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Table as ReactTable, RowSelectionState, ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '../ui/checkbox';
import { AllClassifications } from './imobilizado-analysis';
import { useToast } from '@/hooks/use-toast';
import { cfopDescriptions } from '@/lib/cfop';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '@/lib/utils';


type ValidationStatus = 'correct' | 'incorrect' | 'verify' | 'unvalidated';

interface ReconciledItem extends Record<string, any> {
    'Chave de acesso': string;
    'Item': string;
    'CFOP': string;
    'Sienge_CFOP': string;
    'Descrição': string;
    'CST do ICMS'?: string;
    'pICMS'?: number; // Alíquota
    'CPF/CNPJ do Emitente': string;
    'Código': string; // prod_cProd
    uniqueProductKey: string;
    id: string; // unique per row
}

interface CfopValidatorProps {
    reconciledData: any[];
    competence: string | null;
    allPersistedClassifications: AllClassifications;
    onPersistAllClassifications: (allData: AllClassifications) => void;
}

export function CfopValidator({ reconciledData, competence, allPersistedClassifications, onPersistAllClassifications }: CfopValidatorProps) {
    const { toast } = useToast();
    const [classifications, setClassifications] = useState<Record<string, { classification: ValidationStatus, isDifal: boolean }>>({});
    const [hasChanges, setHasChanges] = useState(false);
    const [selectedSiengeCfop, setSelectedSiengeCfop] = useState<string | null>(null);
    const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
    
    const tableRef = React.useRef<ReactTable<ReconciledItem> | null>(null);

    const itemsToValidate = useMemo((): ReconciledItem[] => {
        return reconciledData.map((item) => {
            const uniqueProductKey = `${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}-${item.Sienge_CFOP || ''}`;
            const id = `${item['Chave de acesso']}-${item['Item']}`;
            return { ...item, uniqueProductKey, id };
        });
    }, [reconciledData]);

     useEffect(() => {
        if (!competence) return;

        const persistedForCompetence = allPersistedClassifications[competence]?.cfopValidations?.classifications || {};
        
        const initialClassifications = Object.fromEntries(
            itemsToValidate.map(item => {
                let classificationFromStore = persistedForCompetence[item.uniqueProductKey];
                
                if (!classificationFromStore) {
                    for (const otherCompetence in allPersistedClassifications) {
                        const found = allPersistedClassifications[otherCompetence]?.cfopValidations?.classifications?.[item.uniqueProductKey];
                        if (found) {
                            classificationFromStore = found;
                            break;
                        }
                    }
                }
                
                return [
                    item.id,
                    classificationFromStore || { classification: 'unvalidated', isDifal: false }
                ];
            })
        );

        setClassifications(initialClassifications);
        setHasChanges(false);
    }, [itemsToValidate, competence, allPersistedClassifications]);

    const handleStatusChange = (itemsToChange: ReconciledItem[], newStatus: ValidationStatus) => {
        setClassifications(prev => {
            const newClassifications = { ...prev };
            itemsToChange.forEach(item => {
                newClassifications[item.id] = {
                    ...(newClassifications[item.id] || { classification: 'unvalidated', isDifal: false }),
                    classification: newStatus
                };
            });
            return newClassifications;
        });
        setHasChanges(true);
    };

    const handleDifalToggle = (itemsToChange: ReconciledItem[]) => {
         setClassifications(prev => {
            const newClassifications = { ...prev };
            itemsToChange.forEach(item => {
                const currentStatus = newClassifications[item.id] || { classification: 'unvalidated', isDifal: false };
                newClassifications[item.id] = { ...currentStatus, isDifal: !currentStatus.isDifal };
            });
            return newClassifications;
        });
        setHasChanges(true);
    };
    
    const handleBulkAction = (action: 'correct' | 'incorrect' | 'verify' | 'difal') => {
        if (!tableRef.current) return;
        const selectedItems = tableRef.current.getFilteredSelectedRowModel().rows.map(row => row.original);
        
        if (selectedItems.length === 0) {
            toast({ title: "Nenhum item selecionado", variant: 'destructive' });
            return;
        }

        if (action === 'difal') {
            handleDifalToggle(selectedItems);
        } else {
            handleStatusChange(selectedItems, action as ValidationStatus);
            setRowSelection({});
        }
    };

    const handleSaveChanges = () => {
        if (!competence) return;

        const updatedPersistedData = JSON.parse(JSON.stringify(allPersistedClassifications));
        if (!updatedPersistedData[competence]) updatedPersistedData[competence] = { classifications: {}, accountCodes: {}, cfopValidations: { classifications: {} } };
        if (!updatedPersistedData[competence].cfopValidations) updatedPersistedData[competence].cfopValidations = { classifications: {} };
        if (!updatedPersistedData[competence].cfopValidations.classifications) updatedPersistedData[competence].cfopValidations.classifications = {};

        itemsToValidate.forEach(item => {
            const currentClassification = classifications[item.id];
            if (currentClassification) {
                updatedPersistedData[competence].cfopValidations.classifications[item.uniqueProductKey] = currentClassification;
            }
        });

        onPersistAllClassifications(updatedPersistedData);
        setHasChanges(false);
        toast({ title: 'Validações de CFOP guardadas!' });
    };
    
    const groupedBySiengeCfop = useMemo(() => {
        const grouped = itemsToValidate.reduce((acc, item) => {
            const siengeCfop = item.Sienge_CFOP || 'N/A';
            if (!acc[siengeCfop]) {
                acc[siengeCfop] = [];
            }
            acc[siengeCfop].push(item);
            return acc;
        }, {} as Record<string, ReconciledItem[]>);
        
        const sortedGroups = Object.entries(grouped).sort(([cfopA], [cfopB]) => {
            if (cfopA === 'N/A') return 1;
            if (cfopB === 'N/A') return -1;
            return parseInt(cfopA, 10) - parseInt(cfopB, 10);
        });

        if (sortedGroups.length > 0 && !selectedSiengeCfop) {
            setSelectedSiengeCfop(sortedGroups[0][0]);
        } else if (sortedGroups.length === 0) {
            setSelectedSiengeCfop(null);
        }

        return sortedGroups;
    }, [itemsToValidate]);

    const itemsForSelectedCfop = useMemo(() => {
        if (!selectedSiengeCfop) return [];
        const group = groupedBySiengeCfop.find(([cfop]) => cfop === selectedSiengeCfop);
        return group ? group[1] : [];
    }, [selectedSiengeCfop, groupedBySiengeCfop]);

    
    const columns: ColumnDef<ReconciledItem>[] = useMemo(() => [
        {
            id: 'select',
            header: ({ table }) => <Checkbox checked={table.getIsAllPageRowsSelected()} onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)} aria-label="Selecionar todas" />,
            cell: ({ row }) => (
                <div onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={row.getIsSelected()} onCheckedChange={(value) => row.toggleSelected(!!value)} aria-label="Selecionar linha" />
                </div>
            ),
            enableSorting: false,
        },
        {
            id: 'status',
            header: 'Status',
            cell: ({ row }) => {
                 const status = classifications[row.original.id]?.classification || 'unvalidated';
                 const icons: Record<ValidationStatus, React.ReactNode> = {
                    unvalidated: <ListFilter className="h-5 w-5 text-muted-foreground" />,
                    correct: <Check className="h-5 w-5 text-green-600" />,
                    incorrect: <X className="h-5 w-5 text-red-600" />,
                    verify: <AlertTriangle className="h-5 w-5 text-amber-600" />,
                 };
                 return <div className="flex justify-center">{icons[status]}</div>;
            }
        },
         ...getColumnsWithCustomRender(
            itemsToValidate,
            ['Fornecedor', 'Número da Nota', 'Descrição', 'CFOP'],
            (row, id) => <div className="truncate max-w-xs">{String(row.original[id as keyof ReconciledItem] || '')}</div>
        ),
        {
            id: 'isDifal',
            header: 'DIFAL',
            cell: ({ row }) => {
                const isDifal = classifications[row.original.id]?.isDifal || false;
                return <div className='flex justify-center'>{isDifal ? <Check className="h-5 w-5 text-blue-600" /> : null}</div>;
            }
        },
        {
            id: 'actions',
            header: () => <div className='text-center'>Ações</div>,
            cell: ({ row }) => (
                 <div className="flex gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
                    <TooltipProvider>
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStatusChange([row.original], 'correct')}><Check className="h-5 w-5 text-green-600"/></Button></TooltipTrigger><TooltipContent><p>Correto</p></TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStatusChange([row.original], 'incorrect')}><X className="h-5 w-5 text-red-600"/></Button></TooltipTrigger><TooltipContent><p>Incorreto</p></TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStatusChange([row.original], 'verify')}><AlertTriangle className="h-5 w-5 text-amber-600"/></Button></TooltipTrigger><TooltipContent><p>Verificar</p></TooltipContent></Tooltip>
                    </TooltipProvider>
                </div>
            )
        }
    ], [itemsToValidate, classifications]);
    
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
    
    const numSelected = Object.keys(rowSelection).length;

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="md:col-span-1 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Navegação por CFOP</CardTitle>
                        <CardDescription>Selecione um CFOP para ver os itens.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[calc(100vh-350px)]">
                             <div className="space-y-1">
                                {groupedBySiengeCfop.map(([cfop, items]) => (
                                    <Button
                                        key={cfop}
                                        variant={selectedSiengeCfop === cfop ? 'secondary' : 'ghost'}
                                        className="w-full justify-start h-auto py-2"
                                        onClick={() => {setSelectedSiengeCfop(cfop); setRowSelection({});}}
                                    >
                                        <div className="flex flex-col text-left">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold">{cfop}</span>
                                                <span className="text-xs text-muted-foreground">({items.length} itens)</span>
                                            </div>
                                            <p className="text-xs font-normal text-muted-foreground whitespace-normal">
                                                {cfopDescriptions[parseInt(cfop, 10) as keyof typeof cfopDescriptions] || 'Descrição não encontrada'}
                                            </p>
                                        </div>
                                    </Button>
                                ))}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
                 <Button onClick={handleSaveChanges} disabled={!hasChanges} className="w-full">
                    <Save className="mr-2 h-4 w-4"/> Guardar Validações
                </Button>
            </div>
            <div className="md:col-span-3">
                <Card>
                    <CardHeader>
                         <CardTitle>Itens para o CFOP: <span className="text-primary">{selectedSiengeCfop}</span></CardTitle>
                         {numSelected > 0 && (
                            <Card className="flex items-center gap-4 p-3 shadow-lg animate-in fade-in-0 mt-4">
                                <span className="text-sm font-medium pl-2">{numSelected} item(ns) selecionado(s)</span>
                                <div className="h-6 border-l" />
                                <span className="text-sm font-medium">Ações em Lote:</span>
                                <div className="flex gap-2">
                                    <Button size="sm" variant="outline" onClick={() => handleBulkAction('correct')}><Check className="mr-2 h-4 w-4 text-green-600"/>Correto</Button>
                                    <Button size="sm" variant="outline" onClick={() => handleBulkAction('incorrect')}><X className="mr-2 h-4 w-4 text-red-600"/>Incorreto</Button>
                                    <Button size="sm" variant="outline" onClick={() => handleBulkAction('verify')}><AlertTriangle className="mr-2 h-4 w-4 text-amber-600"/>Verificar</Button>
                                    <div className="h-6 border-l" />
                                    <Button size="sm" variant="outline" onClick={() => handleBulkAction('difal')}>DIFAL</Button>
                                </div>
                            </Card>
                        )}
                    </CardHeader>
                    <CardContent>
                       <DataTable columns={columns} data={itemsForSelectedCfop} tableRef={tableRef} rowSelection={rowSelection} setRowSelection={setRowSelection} />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
