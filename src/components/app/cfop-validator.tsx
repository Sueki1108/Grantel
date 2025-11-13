"use client";

import * as React from 'react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Check, AlertTriangle, Save, X, ListFilter, RotateCw, HelpCircle, ClipboardCopy, Settings } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Table as ReactTable, ColumnDef } from '@tanstack/react-table';
import { AllClassifications } from './imobilizado-analysis';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { cfopDescriptions } from '@/lib/cfop';
import { getColumnsWithCustomRender } from './columns-helper';
import { Checkbox } from '../ui/checkbox';
import { ScrollArea } from '../ui/scroll-area';


type ValidationStatus = 'unvalidated' | 'correct' | 'incorrect' | 'verify';

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

const STATUS_CONFIG: Record<ValidationStatus, { label: string; icon: React.ReactNode; badge: "default" | "destructive" | "secondary" | "outline" }> = {
    unvalidated: { label: 'Pendentes', icon: <ListFilter className="h-4 w-4" />, badge: "outline" },
    correct: { label: 'Corretos', icon: <Check className="h-4 w-4" />, badge: "default" },
    incorrect: { label: 'Incorretos', icon: <X className="h-4 w-4" />, badge: "destructive" },
    verify: { label: 'Verificar', icon: <AlertTriangle className="h-4 w-4" />, badge: "secondary" },
};


export function CfopValidator({ reconciledData, competence, allPersistedClassifications, onPersistAllClassifications }: CfopValidatorProps) {
    const { toast } = useToast();
    const [classifications, setClassifications] = useState<Record<string, { classification: ValidationStatus, isDifal: boolean }>>({});
    const [hasChanges, setHasChanges] = useState(false);
    const tableRef = useRef<ReactTable<ReconciledItem> | null>(null);
    const [activeTab, setActiveTab] = useState<ValidationStatus>('unvalidated');
    const [activeCfopTab, setActiveCfopTab] = useState<string | null>(null);

    const [filters, setFilters] = useState<{ cfopXml: Set<string>; cstIcms: Set<string>; aliqIcms: Set<string> }>({
        cfopXml: new Set(),
        cstIcms: new Set(),
        aliqIcms: new Set(),
    });
    
    const [numSelected, setNumSelected] = React.useState(0);

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
    
    const { groupedItemsByStatus, filterOptions } = useMemo(() => {
        const itemsWithStatus = itemsToValidate.map(item => ({ ...item, status: classifications[item.id]?.classification || 'unvalidated' }));
        const options = {
            cfopXml: new Set<string>(), cstIcms: new Set<string>(), aliqIcms: new Set<string>(),
        };
        itemsWithStatus.forEach(item => {
            if (item.CFOP) options.cfopXml.add(item.CFOP);
            if (item['CST do ICMS']) options.cstIcms.add(item['CST do ICMS']);
            if (item.pICMS !== undefined) options.aliqIcms.add(String(item.pICMS));
        });

        const filtered = itemsWithStatus.filter(item => 
            (filters.cfopXml.size === 0 || filters.cfopXml.has(item.CFOP)) &&
            (filters.cstIcms.size === 0 || (item['CST do ICMS'] && filters.cstIcms.has(item['CST do ICMS']))) &&
            (filters.aliqIcms.size === 0 || (item.pICMS !== undefined && filters.aliqIcms.has(String(item.pICMS))))
        );

        const categories: Record<ValidationStatus, Record<string, ReconciledItem[]>> = {
            unvalidated: {}, correct: {}, incorrect: {}, verify: {}
        };
        filtered.forEach(item => {
            const siengeCfop = item.Sienge_CFOP || 'N/A';
            if (!categories[item.status][siengeCfop]) categories[item.status][siengeCfop] = [];
            categories[item.status][siengeCfop].push(item);
        });

        // Ordena os grupos de CFOP dentro de cada status
        Object.keys(categories).forEach(status => {
            const sortedEntries = Object.entries(categories[status as ValidationStatus]).sort(([a], [b]) => a.localeCompare(b));
            categories[status as ValidationStatus] = Object.fromEntries(sortedEntries);
        });

        return { groupedItemsByStatus: categories, filterOptions: options };
    }, [itemsToValidate, classifications, filters]);

    // Initialize filters with all options selected
    useEffect(() => {
        setFilters({
            cfopXml: new Set(filterOptions.cfopXml),
            cstIcms: new Set(filterOptions.cstIcms),
            aliqIcms: new Set(filterOptions.aliqIcms),
        });
    }, [filterOptions.cfopXml.size, filterOptions.cstIcms.size, filterOptions.aliqIcms.size]);


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
            const isTogglingToTrue = !itemsToChange[0] || !newClassifications[itemsToChange[0].id]?.isDifal;

            itemsToChange.forEach(item => {
                const currentStatus = newClassifications[item.id] || { classification: 'unvalidated', isDifal: false };
                newClassifications[item.id] = { ...currentStatus, isDifal: isTogglingToTrue };
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
            ['Fornecedor', 'Número da Nota', 'Descrição', 'Valor Total', 'CFOP', 'Descricao CFOP', 'Sienge_CFOP', 'CST do ICMS', 'pICMS'],
            (row, id) => {
                const value = row.original[id as keyof ReconciledItem];
                let displayValue = String(value ?? '');
                
                 if (id === 'Valor Total' && typeof value === 'number') {
                     displayValue = value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                 } else if (id === 'pICMS' && typeof value === 'number') {
                     displayValue = `${value.toFixed(2)}%`;
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
            id: 'actions',
            header: () => <div className='text-center'>Ações</div>,
            cell: ({ row }) => {
                const isDifal = classifications[row.original.id]?.isDifal || false;
                 return (
                    <div className="flex gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
                        <TooltipProvider>
                            <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStatusChange([row.original], 'correct')}><Check className="h-5 w-5 text-green-600"/></Button></TooltipTrigger><TooltipContent><p>Correto</p></TooltipContent></Tooltip>
                            <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStatusChange([row.original], 'incorrect')}><X className="h-5 w-5 text-red-600"/></Button></TooltipTrigger><TooltipContent><p>Incorreto</p></TooltipContent></Tooltip>
                            <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStatusChange([row.original], 'verify')}><AlertTriangle className="h-5 w-5 text-amber-600"/></Button></TooltipTrigger><TooltipContent><p>Verificar</p></TooltipContent></Tooltip>
                            <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStatusChange([row.original], 'unvalidated')}><RotateCw className="h-5 w-5 text-blue-600"/></Button></TooltipTrigger><TooltipContent><p>Reverter para Pendente</p></TooltipContent></Tooltip>
                            <div className="border-l h-6 mx-1" />
                             <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button size="sm" variant={isDifal ? 'default' : 'ghost'} className="h-8" onClick={() => handleDifalToggle([row.original])}>DIFAL</Button>
                                </TooltipTrigger>
                                <TooltipContent><p>Marcar/Desmarcar DIFAL</p></TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                )
            }
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
    
    const handleFilterChange = (filterType: keyof typeof filters, value: string, checked: boolean) => {
        setFilters(prev => {
            const newSet = new Set(prev[filterType]);
            if (checked) {
                newSet.add(value);
            } else {
                newSet.delete(value);
            }
            return { ...prev, [filterType]: newSet };
        });
    };

    const handleSelectAllFilters = (filterType: keyof typeof filters) => {
        setFilters(prev => ({...prev, [filterType]: new Set(filterOptions[filterType])}));
    }

    const handleClearAllFilters = (filterType: keyof typeof filters) => {
        setFilters(prev => ({...prev, [filterType]: new Set()}));
    }
    
    const currentStatusGroup = groupedItemsByStatus[activeTab] || {};
    const firstCfopInTab = Object.keys(currentStatusGroup)[0] || null;

    useEffect(() => {
        setActiveCfopTab(firstCfopInTab);
    }, [activeTab, firstCfopInTab]);
    
    return (
        <div className='relative'>
             {numSelected > 0 && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 w-auto">
                    <Card className="flex items-center gap-4 p-3 shadow-2xl animate-in fade-in-0 slide-in-from-bottom-5">
                        <span className="text-sm font-medium pl-2">{numSelected} item(ns) selecionado(s)</span>
                        <div className="h-6 border-l" />
                        <span className="text-sm font-medium">Classificar como:</span>
                        <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleBulkAction('correct')}><Check className="mr-2 h-4 w-4 text-green-600"/>Correto</Button>
                            <Button size="sm" variant="outline" onClick={() => handleBulkAction('incorrect')}><X className="mr-2 h-4 w-4 text-red-600"/>Incorreto</Button>
                            <Button size="sm" variant="outline" onClick={() => handleBulkAction('verify')}><AlertTriangle className="mr-2 h-4 w-4 text-amber-600"/>Verificar</Button>
                            <Button size="sm" variant="outline" onClick={() => handleStatusChange(tableRef.current?.getFilteredSelectedRowModel().rows.map(r => r.original) || [], 'unvalidated')}><RotateCw className="mr-2 h-4 w-4 text-blue-600"/>Reverter</Button>
                            <div className="h-6 border-l" />
                            <Button size="sm" variant="secondary" onClick={() => handleBulkAction('difal')}>DIFAL</Button>
                        </div>
                    </Card>
                </div>
            )}
            <Card>
                <CardHeader>
                     <div className='flex items-start justify-between'>
                        <div>
                            <CardTitle className="font-headline text-2xl flex items-center gap-2">Validação de CFOP</CardTitle>
                            <CardDescription>Itens agrupados por status e CFOP do Sienge. Use os filtros para refinar a busca e as ações em lote para classificar rapidamente.</CardDescription>
                        </div>
                        <div className="flex gap-2">
                             <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline"><Settings className="mr-2 h-4 w-4" />Filtros</Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[600px]">
                                     <div className="grid gap-4">
                                        <div className="space-y-2">
                                            <h4 className="font-medium leading-none">Filtrar Itens da Tabela</h4>
                                            <p className="text-sm text-muted-foreground">Selecione os valores para refinar a visualização em todas as abas.</p>
                                        </div>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div>
                                                <h5 className="font-bold text-sm mb-2">CFOP XML</h5>
                                                <div className='flex gap-1 mb-2'><Button size="xs" variant="link" onClick={() => handleSelectAllFilters('cfopXml')}>Todos</Button><Button size="xs" variant="link" onClick={() => handleClearAllFilters('cfopXml')}>Nenhum</Button></div>
                                                <ScrollArea className="h-48 col-span-1 border rounded-md p-2">
                                                    {Array.from(filterOptions.cfopXml).sort().map(cfop => (
                                                        <div key={cfop} className="flex items-center space-x-2"><Checkbox id={`cfop-${cfop}`} checked={filters.cfopXml.has(cfop)} onCheckedChange={c => handleFilterChange('cfopXml', cfop, !!c)} /><Label htmlFor={`cfop-${cfop}`}>{cfop} - {cfopDescriptions[Number(cfop)]?.substring(0,25)}...</Label></div>
                                                    ))}
                                                </ScrollArea>
                                            </div>
                                            <div>
                                                 <h5 className="font-bold text-sm mb-2">CST ICMS</h5>
                                                 <div className='flex gap-1 mb-2'><Button size="xs" variant="link" onClick={() => handleSelectAllFilters('cstIcms')}>Todos</Button><Button size="xs" variant="link" onClick={() => handleClearAllFilters('cstIcms')}>Nenhum</Button></div>
                                                <ScrollArea className="h-48 col-span-1 border rounded-md p-2">
                                                    {Array.from(filterOptions.cstIcms).sort().map(cst => (
                                                        <div key={cst} className="flex items-center space-x-2"><Checkbox id={`cst-${cst}`} checked={filters.cstIcms.has(cst)} onCheckedChange={c => handleFilterChange('cstIcms', cst, !!c)} /><Label htmlFor={`cst-${cst}`}>{cst}</Label></div>
                                                    ))}
                                                </ScrollArea>
                                            </div>
                                             <div>
                                                 <h5 className="font-bold text-sm mb-2">Alíq. ICMS</h5>
                                                 <div className='flex gap-1 mb-2'><Button size="xs" variant="link" onClick={() => handleSelectAllFilters('aliqIcms')}>Todos</Button><Button size="xs" variant="link" onClick={() => handleClearAllFilters('aliqIcms')}>Nenhum</Button></div>
                                                <ScrollArea className="h-48 col-span-1 border rounded-md p-2">
                                                    {Array.from(filterOptions.aliqIcms).sort().map(aliq => (
                                                        <div key={aliq} className="flex items-center space-x-2"><Checkbox id={`aliq-${aliq}`} checked={filters.aliqIcms.has(aliq)} onCheckedChange={c => handleFilterChange('aliqIcms', aliq, !!c)} /><Label htmlFor={`aliq-${aliq}`}>{aliq}%</Label></div>
                                                    ))}
                                                </ScrollArea>
                                            </div>
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                             <Button onClick={handleSaveChanges} disabled={!hasChanges}>
                                <Save className="mr-2 h-4 w-4"/> Guardar Validações
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Tabs value={activeTab} onValueChange={(val) => { setActiveTab(val as ValidationStatus); tableRef.current?.toggleAllRowsSelected(false); }}>
                        <TabsList>
                             {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                                <TabsTrigger key={status} value={status} className="flex items-center gap-2">
                                    {config.icon}
                                    {config.label}
                                    <Badge variant={config.badge} className="ml-2">
                                        {Object.values(groupedItemsByStatus[status as ValidationStatus]).reduce((sum, items) => sum + items.length, 0)}
                                    </Badge>
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    
                        <TabsContent value={activeTab} className="mt-4">
                             {Object.keys(currentStatusGroup).length > 0 ? (
                                 <Tabs value={activeCfopTab || ''} onValueChange={setActiveCfopTab} className="w-full">
                                    <ScrollArea>
                                         <TabsList>
                                             {Object.entries(currentStatusGroup).map(([cfop, items]) => (
                                                <TabsTrigger key={cfop} value={cfop}>{cfop} ({items.length})</TabsTrigger>
                                            ))}
                                        </TabsList>
                                        <ScrollBar orientation="horizontal" />
                                    </ScrollArea>
                                     {Object.entries(currentStatusGroup).map(([cfop, items]) => (
                                        <TabsContent key={cfop} value={cfop} className="mt-4">
                                            <DataTable columns={columns} data={items} tableRef={tableRef} onSelectionChange={setNumSelected} />
                                        </TabsContent>
                                    ))}
                                </Tabs>
                             ) : (
                                <div className="text-center text-muted-foreground p-8">Nenhum item nesta categoria com os filtros atuais.</div>
                             )}
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>
        </div>
    );
}
