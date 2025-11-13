"use client";

import * as React from 'react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { getColumnsWithCustomRender } from "@/components/app/columns-helper";
import { Check, AlertTriangle, Save, X, ListFilter, Factory, Wrench, RotateCw, CheckSquare, HelpCircle, ClipboardCopy } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Table as ReactTable, ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '../ui/checkbox';
import { AllClassifications } from './imobilizado-analysis';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';


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

const STATUS_CONFIG: Record<ValidationStatus, { label: string; icon: React.ReactNode }> = {
    unvalidated: { label: 'Não Validado', icon: <ListFilter className="h-4 w-4 mr-2" /> },
    correct: { label: 'Correto', icon: <Check className="h-4 w-4 mr-2 text-green-600" /> },
    incorrect: { label: 'Incorreto', icon: <X className="h-4 w-4 mr-2 text-red-600" /> },
    verify: { label: 'Verificar', icon: <AlertTriangle className="h-4 w-4 mr-2 text-amber-600" /> },
};


export function CfopValidator({ reconciledData, competence, allPersistedClassifications, onPersistAllClassifications }: CfopValidatorProps) {
    const { toast } = useToast();
    const [classifications, setClassifications] = useState<Record<string, { classification: ValidationStatus, isDifal: boolean }>>({});
    const [hasChanges, setHasChanges] = useState(false);
    const [activeTab, setActiveTab] = useState<ValidationStatus>('unvalidated');
    const tableRef = useRef<ReactTable<ReconciledItem> | null>(null);
    const [numSelected, setNumSelected] = useState(0);

    const [filters, setFilters] = useState({
        cfopXml: new Set<string>(),
        cstIcms: new Set<string>(),
        aliqIcms: new Set<string>(),
    });

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
    
    
    const filteredItemsByStatus = useMemo(() => {
        const grouped: Record<ValidationStatus, ReconciledItem[]> = {
            unvalidated: [], correct: [], incorrect: [], verify: []
        };

        itemsToValidate.forEach(item => {
            const status = classifications[item.id]?.classification || 'unvalidated';
            grouped[status].push(item);
        });

        return grouped;

    }, [itemsToValidate, classifications]);


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
        }
        tableRef.current.toggleAllRowsSelected(false);
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
    
    const copyToClipboard = (text: string | number | undefined, type: string) => {
        const textToCopy = String(text ?? '');
        navigator.clipboard.writeText(textToCopy).then(() => {
            toast({ title: `${type} copiad${type.endsWith('a') ? 'a' : 'o'}`, description: textToCopy });
        }).catch(() => {
            toast({ variant: 'destructive', title: `Falha ao copiar ${type}` });
        });
    };
    
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
        ...getColumnsWithCustomRender(
            itemsToValidate,
            ['Fornecedor', 'Número da Nota', 'Descrição', 'CFOP', 'Sienge_CFOP', 'Valor Total'],
            (row, id) => {
                const value = row.original[id as keyof ReconciledItem];
                let displayValue = String(value ?? '');
                
                 if (id === 'Valor Total' && typeof value === 'number') {
                     displayValue = value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                 }
                return (
                     <div className="group flex items-center justify-between gap-1">
                        <span className="truncate max-w-xs" title={String(value)}>{displayValue}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); copyToClipboard(value, id); }}><ClipboardCopy className="h-3 w-3" /></Button>
                    </div>
                )
            }
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
                        <div className="border-l h-6 mx-1" />
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDifalToggle([row.original])}>DIFAL</Button></TooltipTrigger><TooltipContent><p>Marcar/Desmarcar DIFAL</p></TooltipContent></Tooltip>
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
    
    const handleTabChange = (value: string) => {
        setActiveTab(value as ValidationStatus);
        if (tableRef.current) {
            tableRef.current.toggleAllRowsSelected(false);
        }
    };


    return (
        <div className='relative'>
            {numSelected > 0 && (
                <div className="fixed bottom-4 z-20 w-full flex justify-center">
                    <Card className="flex items-center gap-4 p-3 shadow-2xl animate-in fade-in-0 slide-in-from-bottom-5">
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
                </div>
            )}
            <Card>
                <CardHeader>
                     <div className='flex items-start justify-between'>
                        <div>
                            <CardTitle className="font-headline text-2xl flex items-center gap-2"><CheckSquare className="h-8 w-8 text-primary"/>Validação de CFOP</CardTitle>
                            <CardDescription>Analise os itens por status e valide a correspondência com o CFOP do XML.</CardDescription>
                        </div>
                         <Button onClick={handleSaveChanges} disabled={!hasChanges} className="shrink-0">
                            <Save className="mr-2 h-4 w-4"/> Guardar Validações
                        </Button>
                    </div>
                </CardHeader>
                 <CardContent>
                     <Tabs value={activeTab} onValueChange={handleTabChange}>
                        <TabsList className="grid w-full grid-cols-4">
                            {(Object.keys(STATUS_CONFIG) as ValidationStatus[]).map(status => (
                                <TabsTrigger key={status} value={status} className="flex items-center gap-2">
                                    {STATUS_CONFIG[status].icon}
                                    {STATUS_CONFIG[status].label}
                                    <Badge variant={activeTab === status ? "default" : "secondary"}>{filteredItemsByStatus[status].length}</Badge>
                                </TabsTrigger>
                            ))}
                        </TabsList>
                        
                        {(Object.keys(STATUS_CONFIG) as ValidationStatus[]).map(status => (
                             <TabsContent key={status} value={status} className="mt-4 space-y-4">
                                <DataTable columns={columns} data={filteredItemsByStatus[status]} tableRef={tableRef} onSelectionChange={(rowCount) => setNumSelected(rowCount)} />
                            </TabsContent>
                        ))}
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
}
