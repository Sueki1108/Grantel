"use client";

import * as React from 'react';
import { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/components/app/columns-helper";
import { Check, AlertTriangle, Save, X, ListFilter, FilterX, RotateCw, ChevronDown, ChevronRight, CheckSquare } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Table as ReactTable, RowSelectionState } from '@tanstack/react-table';
import { Checkbox } from '../ui/checkbox';
import { AllClassifications } from './imobilizado-analysis';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { cfopDescriptions } from '@/lib/cfop';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { ScrollArea } from '../ui/scroll-area';
import { Label } from '../ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';


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

const CFOP_VALIDATOR_FILTERS_KEY = 'cfopValidatorFilters';

type FilterState = {
    cfopXml: Set<string>;
    cst: Set<string>;
    aliquota: Set<string>;
};

export function CfopValidator({ reconciledData, competence, allPersistedClassifications, onPersistAllClassifications }: CfopValidatorProps) {
    const { toast } = useToast();
    const [classifications, setClassifications] = useState<Record<string, { classification: ValidationStatus, isDifal: boolean }>>({});
    const [hasChanges, setHasChanges] = useState(false);
    const [activeTab, setActiveTab] = useState<ValidationStatus | 'all'>('unvalidated');

    const [filterState, setFilterState] = useState<FilterState>({ cfopXml: new Set(), cst: new Set(), aliquota: new Set() });
    const [availableFilters, setAvailableFilters] = useState<{ cfopXml: string[], cst: string[], aliquota: string[] }>({ cfopXml: [], cst: [], aliquota: [] });
    const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
    
    const tableRef = React.useRef<ReactTable<ReconciledItem> | null>(null);


    const itemsToValidate = useMemo((): ReconciledItem[] => {
        return reconciledData.map((item) => {
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
        const cfopXmlOptions = new Set<string>();
        const cstOptions = new Set<string>();
        const aliquotaOptions = new Set<string>();

        itemsToValidate.forEach(item => {
            if (item['CFOP']) cfopXmlOptions.add(String(item['CFOP']));
            if (item['CST do ICMS']) cstOptions.add(String(item['CST do ICMS']));
            if (item['pICMS'] !== undefined && item['pICMS'] !== null) aliquotaOptions.add(String(item['pICMS']));
        });

        const sortedFilters = {
            cfopXml: Array.from(cfopXmlOptions).sort(),
            cst: Array.from(cstOptions).sort(),
            aliquota: Array.from(aliquotaOptions).sort((a, b) => parseFloat(a) - parseFloat(b)),
        };
        setAvailableFilters(sortedFilters);
        
        try {
            const savedFilters = localStorage.getItem(CFOP_VALIDATOR_FILTERS_KEY);
            if (savedFilters) {
                const parsed = JSON.parse(savedFilters);
                setFilterState({
                    cfopXml: new Set(parsed.cfopXml || sortedFilters.cfopXml),
                    cst: new Set(parsed.cst || sortedFilters.cst),
                    aliquota: new Set(parsed.aliquota || sortedFilters.aliquota),
                });
            } else {
                setFilterState({
                    cfopXml: new Set(sortedFilters.cfopXml),
                    cst: new Set(sortedFilters.cst),
                    aliquota: new Set(sortedFilters.aliquota),
                });
            }
        } catch (e) {
            console.error("Failed to load CFOP filters from localStorage", e);
            setFilterState({
                cfopXml: new Set(sortedFilters.cfopXml),
                cst: new Set(sortedFilters.cst),
                aliquota: new Set(sortedFilters.aliquota),
            });
        }

    }, [itemsToValidate]);
    
    useEffect(() => {
        const filtersToSave = {
            cfopXml: Array.from(filterState.cfopXml),
            cst: Array.from(filterState.cst),
            aliquota: Array.from(filterState.aliquota),
        };
        localStorage.setItem(CFOP_VALIDATOR_FILTERS_KEY, JSON.stringify(filtersToSave));
    }, [filterState]);

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
            // Deselect rows after applying a status
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
    
     const filteredAndGroupedItems = useMemo(() => {
        const itemsInTab = itemsToValidate.filter(item => {
            const classification = classifications[item.id]?.classification || 'unvalidated';
            return activeTab === 'all' || classification === activeTab;
        });

        const filteredByAttributes = itemsInTab.filter(item => {
            const cfopMatch = filterState.cfopXml.has(String(item['CFOP']));
            const cstMatch = filterState.cst.has(String(item['CST do ICMS']));
            const aliquotaMatch = filterState.aliquota.has(String(item['pICMS']));
            return cfopMatch && cstMatch && aliquotaMatch;
        });

        const grouped = filteredByAttributes.reduce((acc, item) => {
            const siengeCfop = item.Sienge_CFOP || 'N/A';
            if (!acc[siengeCfop]) {
                acc[siengeCfop] = [];
            }
            acc[siengeCfop].push(item);
            return acc;
        }, {} as Record<string, ReconciledItem[]>);

        return Object.entries(grouped).sort(([cfopA], [cfopB]) => parseInt(cfopA, 10) - parseInt(cfopB, 10));

    }, [itemsToValidate, classifications, filterState, activeTab]);

    const handleFilterChange = (filterType: keyof FilterState, value: string, checked: boolean) => {
        setFilterState(prev => {
            const newSet = new Set(prev[filterType]);
            if (checked) {
                newSet.add(value);
            } else {
                newSet.delete(value);
            }
            return { ...prev, [filterType]: newSet };
        });
    };

    const FilterPopover = ({ filterType, title }: { filterType: keyof FilterState, title: string }) => {
        const options = availableFilters[filterType];
        const selected = filterState[filterType];

        return (
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="h-8">
                        {title} ({selected.size}/{options.length}) <ListFilter className="ml-2 h-4 w-4" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0">
                     <div className='p-2 border-b'>
                        <Button variant="link" size="sm" onClick={() => setFilterState(p => ({...p, [filterType]: new Set(options)}))}>Todos</Button>
                        <Button variant="link" size="sm" onClick={() => setFilterState(p => ({...p, [filterType]: new Set()}))}>Nenhum</Button>
                    </div>
                    <ScrollArea className="h-72">
                        <div className='p-4 space-y-2'>
                        {options.map(option => (
                             <div key={option} className="flex items-center space-x-2">
                                <Checkbox
                                    id={`${filterType}-${option}`}
                                    checked={selected.has(option)}
                                    onCheckedChange={(checked) => handleFilterChange(filterType, option, !!checked)}
                                />
                                <Label htmlFor={`${filterType}-${option}`} className="font-normal">{option}</Label>
                            </div>
                        ))}
                        </div>
                    </ScrollArea>
                </PopoverContent>
            </Popover>
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
    
    const columns: ColumnDef<ReconciledItem>[] = [
        {
            id: 'select',
            header: ({ table }) => <Checkbox checked={table.getIsAllPageRowsSelected()} onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)} aria-label="Selecionar todas" />,
            cell: ({ row }) => <Checkbox checked={row.getIsSelected()} onCheckedChange={(value) => row.toggleSelected(!!value)} aria-label="Selecionar linha" onClick={(e) => e.stopPropagation()}/>,
            enableSorting: false,
        },
         ...getColumnsWithCustomRender(
            itemsToValidate,
            ['Fornecedor', 'Número da Nota', 'Descrição', 'CFOP', 'CST do ICMS', 'pICMS'],
            (row, id) => <div className="truncate max-w-xs">{String(row.original[id as keyof ReconciledItem] || '')}</div>
        ),
        {
            id: 'isDifal',
            header: 'DIFAL',
            cell: ({ row }) => {
                const isDifal = classifications[row.original.id]?.isDifal || false;
                return <div className='flex justify-center'>{isDifal ? <Check className="h-5 w-5 text-blue-600" /> : <X className="h-5 w-5 text-muted-foreground" />}</div>;
            }
        },
        {
            id: 'actions',
            header: () => <div className='text-center'>Ações</div>,
            cell: ({ row }) => (
                 <TooltipProvider>
                    <div className="flex gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStatusChange([row.original], 'correct')}><Check className="h-5 w-5 text-green-600"/></Button></TooltipTrigger><TooltipContent><p>Correto</p></TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStatusChange([row.original], 'incorrect')}><X className="h-5 w-5 text-red-600"/></Button></TooltipTrigger><TooltipContent><p>Incorreto</p></TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStatusChange([row.original], 'verify')}><AlertTriangle className="h-5 w-5 text-amber-600"/></Button></TooltipTrigger><TooltipContent><p>Verificar</p></TooltipContent></Tooltip>
                    </div>
                </TooltipProvider>
            )
        }
    ];

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                         <div className='flex items-center gap-3'>
                            <ListFilter className="h-8 w-8 text-primary" />
                            <div>
                                <CardTitle className="font-headline text-2xl">Controlo e Ações</CardTitle>
                                <CardDescription>Use os filtros para refinar a lista, execute ações em lote e guarde as suas validações.</CardDescription>
                            </div>
                        </div>
                         <div className="flex items-center gap-2">
                             <Button onClick={handleSaveChanges} disabled={!hasChanges}><Save className="mr-2 h-4 w-4"/> Guardar Validações</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">Filtros:</span>
                            <FilterPopover filterType="cfopXml" title="CFOP do XML" />
                            <FilterPopover filterType="cst" title="CST do ICMS" />
                            <FilterPopover filterType="aliquota" title="Alíquota de ICMS" />
                            <Button variant="ghost" size="sm" onClick={() => { 
                                setFilterState({
                                    cfopXml: new Set(availableFilters.cfopXml),
                                    cst: new Set(availableFilters.cst),
                                    aliquota: new Set(availableFilters.aliquota)
                                })
                             }}><FilterX className="mr-2 h-4 w-4"/>Limpar Filtros</Button>
                        </div>
                        {numSelected > 0 && (
                            <Card className="flex items-center gap-4 p-3 shadow-lg animate-in fade-in-0">
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
                    </div>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <div className='flex items-center gap-3'>
                        <CheckSquare className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="font-headline text-2xl">Resultados da Validação de CFOP</CardTitle>
                            <CardDescription>Itens agrupados por CFOP do Sienge. Expanda cada grupo para ver os detalhes.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
                        <TabsList>
                            <TabsTrigger value="unvalidated">Não Validados</TabsTrigger>
                            <TabsTrigger value="correct">Corretos</TabsTrigger>
                            <TabsTrigger value="incorrect">Incorretos</TabsTrigger>
                            <TabsTrigger value="verify">A Verificar</TabsTrigger>
                            <TabsTrigger value="all">Todos</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    <div className="mt-4 border rounded-md">
                        <DataTable
                            columns={columns}
                            data={filteredAndGroupedItems.flatMap(([, items]) => items)}
                            tableRef={tableRef}
                            rowSelection={rowSelection}
                            setRowSelection={setRowSelection}
                        />
                    </div>
                </CardContent>
            </Card>

        </div>
    );
}
