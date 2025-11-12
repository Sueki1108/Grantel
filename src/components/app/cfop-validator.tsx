"use client";

import * as React from 'react';
import { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/components/app/columns-helper";
import { Check, AlertTriangle, HelpCircle, Save, X, CheckSquare, ListFilter, FilterX, RotateCcw, ChevronDown, ChevronRight } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { RowSelectionState, Table as ReactTable } from '@tanstack/react-table';
import { Checkbox } from '../ui/checkbox';
import { AllClassifications } from './imobilizado-analysis';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Input } from '../ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { cfopDescriptions } from '@/lib/cfop';
import { Badge } from '../ui/badge';


type ValidationStatus = 'correct' | 'incorrect' | 'verify' | 'unvalidated';

interface ReconciledItem extends Record<string, any> {
    'Chave de acesso': string;
    'Item': string;
    'CFOP': string;
    'Sienge_CFOP': string;
    'Descrição': string;
    'CST do ICMS': string;
    'pICMS': number; // Alíquota
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
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

    const [classifications, setClassifications] = useState<Record<string, { classification: ValidationStatus, isDifal: boolean }>>({});
    const [hasChanges, setHasChanges] = useState(false);
    const [activeTab, setActiveTab] = useState<ValidationStatus | 'all'>('unvalidated');
    const [openCollapsibles, setOpenCollapsibles] = useState<Record<string, boolean>>({});

    
    // Filtros
    const [cfopXmlFilter, setCfopXmlFilter] = useState('');
    const [cstFilter, setCstFilter] = useState('');
    const [aliquotaFilter, setAliquotaFilter] = useState('');

    const tableRefs: Record<string, React.MutableRefObject<ReactTable<ReconciledItem> | null>> = {};


    const itemsToValidate = useMemo((): ReconciledItem[] => {
        return reconciledData.map((item, index) => {
            const uniqueProductKey = `${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}-${item.Sienge_CFOP || ''}`;
            const id = `${item['Chave de acesso']}-${item['Item']}`;
            return {
                ...item,
                uniqueProductKey,
                id,
            };
        });
    }, [reconciledData]);

     useEffect(() => {
        if (!competence) return;

        const persistedForCompetence = allPersistedClassifications[competence]?.cfopValidations?.classifications || {};
        
        const initialClassifications = Object.fromEntries(
            itemsToValidate.map(item => {
                let classificationFromStore = persistedForCompetence[item.uniqueProductKey];
                
                // If not found in current competence, search in others
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
        setRowSelection({});
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

    const handleBulkAction = (action: 'correct' | 'incorrect' | 'verify' | 'toggle_difal') => {
        const selectedItems: ReconciledItem[] = [];

        Object.keys(tableRefs).forEach(key => {
            const table = tableRefs[key].current;
            if (table) {
                selectedItems.push(...table.getFilteredSelectedRowModel().rows.map(row => row.original));
            }
        });
        
        if (selectedItems.length === 0) {
            toast({ title: "Nenhum item selecionado", variant: 'destructive' });
            return;
        }

        if (action === 'toggle_difal') {
            handleDifalToggle(selectedItems);
        } else {
            handleStatusChange(selectedItems, action as ValidationStatus);
        }
        setRowSelection({});
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
    
     const filteredAndCategorizedItems = useMemo(() => {
        const categorized: Record<ValidationStatus, Record<string, ReconciledItem[]>> = {
            unvalidated: {}, correct: {}, incorrect: {}, verify: {}
        };

        itemsToValidate.forEach(item => {
            const classification = classifications[item.id]?.classification || 'unvalidated';
            
            const cfopMatch = !cfopXmlFilter || String(item['CFOP'] || '').includes(cfopXmlFilter);
            const cstMatch = !cstFilter || String(item['CST do ICMS'] || '').includes(cstFilter);
            const aliquotaMatch = !aliquotaFilter || String(item['pICMS'] || '0').includes(aliquotaFilter);

            if (cfopMatch && cstMatch && aliquotaMatch) {
                const siengeCfop = item.Sienge_CFOP || 'N/A';
                if (!categorized[classification][siengeCfop]) {
                    categorized[classification][siengeCfop] = [];
                }
                categorized[classification][siengeCfop].push(item);
            }
        });
        return categorized;
    }, [itemsToValidate, classifications, cfopXmlFilter, cstFilter, aliquotaFilter]);
    

    const renderGroupedTable = (status: ValidationStatus) => {
        const groups = filteredAndCategorizedItems[status];
        const groupKeys = Object.keys(groups).sort();
        
        if (groupKeys.length === 0) {
             return <div className="text-center text-muted-foreground p-8">Nenhum item para exibir.</div>;
        }

        return (
            <div className="space-y-4">
                 {groupKeys.map(cfop => {
                    const items = groups[cfop];
                    const cfopDescription = cfopDescriptions[parseInt(cfop, 10)] || 'Descrição não encontrada';
                    const isGroupOpen = openCollapsibles[`${status}-${cfop}`] ?? true;

                    // Initialize ref for each table
                    if (!tableRefs[`${status}-${cfop}`]) {
                        tableRefs[`${status}-${cfop}`] = React.createRef<ReactTable<ReconciledItem> | null>();
                    }
                    const tableRef = tableRefs[`${status}-${cfop}`];
                    
                    const columns = getColumnsWithCustomRender(
                        items,
                        ['Fornecedor', 'Número da Nota', 'Descrição', 'CFOP', 'CST do ICMS', 'pICMS'],
                        (row, id) => <div className="truncate max-w-xs">{String(row.original[id as keyof ReconciledItem] || '')}</div>
                    );

                    columns.unshift({
                        id: 'select',
                        header: ({ table }: any) => <Checkbox checked={table.getIsAllPageRowsSelected()} onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)} aria-label="Selecionar todas" />,
                        cell: ({ row }: any) => <Checkbox checked={row.getIsSelected()} onCheckedChange={(value) => row.toggleSelected(!!value)} aria-label="Selecionar linha" />,
                        enableSorting: false,
                    });

                     columns.push({
                        id: 'isDifal',
                        header: 'É DIFAL?',
                        cell: ({ row }: any) => {
                            const isDifal = classifications[row.original.id]?.isDifal || false;
                            return <div className='flex justify-center'>{isDifal ? <Check className="h-5 w-5 text-blue-600" /> : <X className="h-5 w-5 text-muted-foreground" />}</div>;
                        }
                    });

                    columns.push({
                        id: 'actions',
                        header: 'Ações',
                        cell: ({ row }: any) => (
                             <TooltipProvider>
                                <div className="flex gap-1 justify-center">
                                    <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStatusChange([row.original], 'correct')}><Check className="h-5 w-5 text-green-600"/></Button></TooltipTrigger><TooltipContent><p>Correto</p></TooltipContent></Tooltip>
                                    <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStatusChange([row.original], 'incorrect')}><X className="h-5 w-5 text-red-600"/></Button></TooltipTrigger><TooltipContent><p>Incorreto</p></TooltipContent></Tooltip>
                                    <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStatusChange([row.original], 'verify')}><AlertTriangle className="h-5 w-5 text-amber-600"/></Button></TooltipTrigger><TooltipContent><p>Verificar</p></TooltipContent></Tooltip>
                                    <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleDifalToggle([row.original])}><CheckSquare className="h-5 w-5 text-blue-600"/></Button></TooltipTrigger><TooltipContent><p>Alternar DIFAL</p></TooltipContent></Tooltip>
                                </div>
                            </TooltipProvider>
                        )
                    });

                    return (
                        <Collapsible 
                            key={cfop} 
                            open={isGroupOpen} 
                            onOpenChange={() => setOpenCollapsibles(prev => ({...prev, [`${status}-${cfop}`]: !isGroupOpen}))}
                        >
                            <CollapsibleTrigger asChild>
                                <div className='flex items-center gap-2 p-2 border-b cursor-pointer hover:bg-muted'>
                                    {isGroupOpen ? <ChevronDown className='h-4 w-4'/> : <ChevronRight className='h-4 w-4'/>}
                                    <Badge>{cfop}</Badge>
                                    <span className="font-medium">{cfopDescription}</span>
                                    <span className="text-sm text-muted-foreground ml-auto">({items.length} itens)</span>
                                </div>
                            </CollapsibleTrigger>
                             <CollapsibleContent className="p-2">
                                <DataTable columns={columns} data={items} tableRef={tableRef} rowSelection={rowSelection} setRowSelection={setRowSelection} />
                            </CollapsibleContent>
                        </Collapsible>
                    )
                 })}
            </div>
        )
    };


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
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                     <div className='flex items-center gap-3'>
                        <CheckSquare className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="font-headline text-2xl">Validação de CFOP</CardTitle>
                            <CardDescription>Compare os CFOPs do XML com os do Sienge, filtre, e valide em lote ou individualmente.</CardDescription>
                        </div>
                    </div>
                     <div className="flex items-center gap-2">
                         <Button onClick={handleSaveChanges} disabled={!hasChanges}><Save className="mr-2 h-4 w-4"/> Guardar Validações</Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                 <div className="mb-4 p-3 border rounded-lg bg-muted/50 flex flex-wrap items-center gap-4">
                     <div className='flex items-center gap-2'>
                        <ListFilter className="h-4 w-4"/>
                        <span className="text-sm font-medium">Filtros:</span>
                    </div>
                     <Input placeholder="CFOP XML..." value={cfopXmlFilter} onChange={e => setCfopXmlFilter(e.target.value)} className="h-8 max-w-24" />
                     <Input placeholder="CST ICMS..." value={cstFilter} onChange={e => setCstFilter(e.target.value)} className="h-8 max-w-24" />
                     <Input placeholder="Alíquota..." value={aliquotaFilter} onChange={e => setAliquotaFilter(e.target.value)} className="h-8 max-w-24" />
                     <Button variant="ghost" size="sm" onClick={() => { setCfopXmlFilter(''); setCstFilter(''); setAliquotaFilter(''); }}><FilterX className="mr-2 h-4 w-4"/>Limpar</Button>
                </div>

                {numSelected > 0 && (
                    <div className="sticky top-20 z-20 mb-4">
                        <Card className="flex items-center gap-4 p-3 shadow-lg animate-in fade-in-0">
                             <span className="text-sm font-medium pl-2">{numSelected} item(ns) selecionado(s)</span>
                            <div className="h-6 border-l" />
                             <span className="text-sm font-medium">Ações em Lote:</span>
                             <div className="flex gap-2">
                                 <Button size="sm" variant="outline" onClick={() => handleBulkAction('correct')}><Check className="mr-2 h-4 w-4 text-green-600"/>Correto</Button>
                                 <Button size="sm" variant="outline" onClick={() => handleBulkAction('incorrect')}><X className="mr-2 h-4 w-4 text-red-600"/>Incorreto</Button>
                                 <Button size="sm" variant="outline" onClick={() => handleBulkAction('verify')}><AlertTriangle className="mr-2 h-4 w-4 text-amber-600"/>Verificar</Button>
                                 <div className="h-6 border-l" />
                                 <Button size="sm" variant="outline" onClick={() => handleBulkAction('toggle_difal')}><CheckSquare className="mr-2 h-4 w-4 text-blue-600"/>Alternar DIFAL</Button>
                             </div>
                        </Card>
                    </div>
                )}
                
                 <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
                    <TabsList>
                        <TabsTrigger value="unvalidated">Não Validados ({Object.values(filteredAndCategorizedItems.unvalidated).flat().length})</TabsTrigger>
                        <TabsTrigger value="correct">Corretos ({Object.values(filteredAndCategorizedItems.correct).flat().length})</TabsTrigger>
                        <TabsTrigger value="incorrect">Incorretos ({Object.values(filteredAndCategorizedItems.incorrect).flat().length})</TabsTrigger>
                        <TabsTrigger value="verify">A Verificar ({Object.values(filteredAndCategorizedItems.verify).flat().length})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="unvalidated" className="mt-4">{renderGroupedTable('unvalidated')}</TabsContent>
                    <TabsContent value="correct" className="mt-4">{renderGroupedTable('correct')}</TabsContent>
                    <TabsContent value="incorrect" className="mt-4">{renderGroupedTable('incorrect')}</TabsContent>
                    <TabsContent value="verify" className="mt-4">{renderGroupedTable('verify')}</TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
