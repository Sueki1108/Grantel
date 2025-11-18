
"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/components/app/columns-helper";
import { Check, X, HelpCircle, Save, RotateCw, ListFilter, Copy, Download, Factory, Wrench, HardHat, EyeOff, Settings, Ticket, MinusCircle } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import type { AllClassifications, CfopClassification } from './imobilizado-analysis';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cfopDescriptions } from '@/lib/cfop';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import * as XLSX from 'xlsx';
import { Card } from '../ui/card';
import type { RowSelectionState } from '@tanstack/react-table';


interface CfopValidatorProps {
    items: any[];
    competence: string | null; 
    onPersistData: (allData: AllClassifications) => void;
    allPersistedData: AllClassifications;
}

type ValidationStatus = 'all' | 'unvalidated' | 'correct' | 'incorrect' | 'verify';

type TabFilters = {
    xmlCsts: Set<string>;
    xmlPicms: Set<string>;
    xmlCfopDescriptions: Set<string>;
};

export function CfopValidator({ items, competence, onPersistData, allPersistedData }: CfopValidatorProps) {
    const { toast } = useToast();
    
    const [cfopValidations, setCfopValidations] = useState<Record<string, CfopClassification>>({});
    const [hasChanges, setHasChanges] = useState(false);
    const [activeStatusTab, setActiveStatusTab] = useState<ValidationStatus>('unvalidated');
    const [activeCfopTabs, setActiveCfopTabs] = useState<Record<string, string>>({});
    const [tabFilters, setTabFilters] = useState<Record<string, TabFilters>>({});
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

    useEffect(() => {
        if (competence && allPersistedData[competence]?.cfopValidations?.classifications) {
            setCfopValidations(allPersistedData[competence].cfopValidations.classifications);
        } else {
            setCfopValidations({});
        }
        setHasChanges(false);
    }, [competence, allPersistedData]);


    const handleValidationChange = (uniqueKey: string, classification: 'correct' | 'incorrect' | 'verify' | 'unvalidated') => {
        setCfopValidations(prev => {
            const newValidations = { ...prev };
            newValidations[uniqueKey] = {
                ...(newValidations[uniqueKey] || { isDifal: false }),
                classification,
            };
            return newValidations;
        });
        setHasChanges(true);
    };
    
    const handleDifalChange = (uniqueKey: string) => {
        setCfopValidations(prev => {
            const current = prev[uniqueKey] || { classification: 'unvalidated', isDifal: false };
            return {
                ...prev,
                [uniqueKey]: {
                    ...current,
                    isDifal: !current.isDifal,
                }
            };
        });
        setHasChanges(true);
    };

    const handleBulkAction = (action: 'correct' | 'incorrect' | 'verify' | 'unvalidated' | 'toggleDifal') => {
        const activeTableData = filteredItemsByStatusAndCfop[activeStatusTab]?.[activeCfopTabs[activeStatusTab]] || [];
        const selectedItemKeys = Object.keys(rowSelection).map(index => activeTableData[parseInt(index)].__itemKey);
        
        const newValidations = { ...cfopValidations };
        let changed = false;

        selectedItemKeys.forEach(itemKey => {
             const uniqueKey = itemKey.replace('cfop-pending-', '');
             if (action === 'toggleDifal') {
                 const current = newValidations[uniqueKey] || { classification: 'unvalidated', isDifal: false };
                 newValidations[uniqueKey] = { ...current, isDifal: !current.isDifal };
             } else {
                 const current = newValidations[uniqueKey] || { isDifal: false };
                 newValidations[uniqueKey] = { ...current, classification: action as any };
             }
             changed = true;
        });

        if (changed) {
            setCfopValidations(newValidations);
            setHasChanges(true);
            setRowSelection({}); // Clear selection after action
        }
    };


    const handleSaveChanges = () => {
        if (!competence) {
            toast({ variant: "destructive", title: "Competência não definida" });
            return;
        }

        const updatedPersistedData = JSON.parse(JSON.stringify(allPersistedData));
        if (!updatedPersistedData[competence]) {
            updatedPersistedData[competence] = {};
        }
        if (!updatedPersistedData[competence].cfopValidations) {
            updatedPersistedData[competence].cfopValidations = {};
        }
        updatedPersistedData[competence].cfopValidations.classifications = cfopValidations;
        
        onPersistData(updatedPersistedData);
        setHasChanges(false);
        toast({title: 'Validações de CFOP guardadas!'});
    };
    
    const handleDownload = (data: any[], title: string) => {
        if (!data || data.length === 0) {
            toast({ title: 'Nenhum dado para exportar', variant: 'destructive' });
            return;
        }
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, title.substring(0, 31));
        XLSX.writeFile(workbook, `CFOP_Validacao_${title}.xlsx`);
    };

    const columns = useMemo(() => {
        const columnsToShow: (keyof any)[] = ['Número da Nota', 'Fornecedor', 'Descrição', 'CFOP', 'CST do ICMS', 'Valor Total', 'pICMS'];
        
        return getColumnsWithCustomRender(
            items,
            columnsToShow,
            (row, id) => {
                const value = row.original[id as keyof typeof row.original];
                
                const renderCellWithCopy = (displayValue: React.ReactNode, copyValue: string | number, typeName: string) => (
                    <div className="group flex items-center justify-between gap-1">
                        <span className="truncate">{displayValue}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => {copyToClipboard(copyValue, typeName)}}>
                            <Copy className="h-3 w-3" />
                        </Button>
                    </div>
                );
                
                const renderCellWithTooltip = (displayValue: string, fullValue: string) => (
                    <TooltipProvider>
                        <Tooltip><TooltipTrigger asChild><span>{displayValue}</span></TooltipTrigger><TooltipContent><p>{fullValue}</p></TooltipContent></Tooltip>
                    </TooltipProvider>
                );
                
                if (id === 'Fornecedor') {
                    const name = String(value || 'N/A');
                    if (name === 'N/A') return <div>N/A</div>;
                    const summarizedName = name.length > 25 ? `${name.substring(0, 25)}...` : name;
                    const display = renderCellWithTooltip(summarizedName, name);
                    return renderCellWithCopy(display, name, 'Fornecedor');
                }

                if (id === 'pICMS') {
                    return <div className='text-center'>{typeof value === 'number' ? `${value.toFixed(2)}%` : 'N/A'}</div>;
                }

                if (['Valor Total'].includes(id) && typeof value === 'number') {
                    return <div className="text-right">{value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>;
                }

                if (id === 'Descrição' && typeof value === 'string') {
                    const summarizedDesc = value.length > 30 ? `${value.substring(0, 30)}...` : value;
                    const display = renderCellWithTooltip(summarizedDesc, value);
                    return renderCellWithCopy(display, value, 'Descrição');
                }
                
                return <div>{String(value ?? '')}</div>;
            }
        ).concat([
            {
                id: 'actions',
                header: 'Ações',
                cell: ({ row }) => {
                    const uniqueKey = `${(row.original['CPF/CNPJ do Emitente'] || '').replace(/\\D/g, '')}-${(row.original['Código'] || '')}-${row.original['Sienge_CFOP']}`;
                    const isDifal = cfopValidations[uniqueKey]?.isDifal;

                    return (
                        <div className="flex justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                             <TooltipProvider>
                                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleValidationChange(uniqueKey, 'correct')}><Check className="h-4 w-4 text-green-600" /></Button></TooltipTrigger><TooltipContent><p>Correto</p></TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleValidationChange(uniqueKey, 'incorrect')}><X className="h-4 w-4 text-red-600" /></Button></TooltipTrigger><TooltipContent><p>Incorreto</p></TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleValidationChange(uniqueKey, 'verify')}><HelpCircle className="h-4 w-4 text-yellow-600" /></Button></TooltipTrigger><TooltipContent><p>A Verificar</p></TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDifalChange(uniqueKey)}><Ticket className={`h-4 w-4 ${isDifal ? 'text-purple-600' : ''}`} /></Button></TooltipTrigger><TooltipContent><p>{isDifal ? 'Desmarcar DIFAL' : 'Marcar como DIFAL'}</p></TooltipContent></Tooltip>
                                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleValidationChange(uniqueKey, 'unvalidated')}><RotateCw className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Limpar Validação</p></TooltipContent></Tooltip>
                            </TooltipProvider>
                        </div>
                    );
                }
            },
        ]);
    }, [items, cfopValidations, toast]);
    
    const copyToClipboard = (text: string | number, type: string) => {
        const textToCopy = String(text);
        navigator.clipboard.writeText(textToCopy).then(() => {
            toast({ title: `${type} copiad${type.endsWith('a') ? 'a' : 'o'}`, description: textToCopy });
        }).catch(() => {
            toast({ variant: 'destructive', title: `Falha ao copiar ${type}` });
        });
    };

    const filteredItemsByStatusAndCfop = useMemo(() => {
        const byStatus: Record<ValidationStatus, any[]> = {
            all: [], unvalidated: [], correct: [], incorrect: [], verify: []
        };
    
        items.forEach(item => {
            const uniqueKey = `${(item['CPF/CNPJ do Emitente'] || '').replace(/\\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}`;
            const classification = cfopValidations[uniqueKey]?.classification || 'unvalidated';
            
            const itemWithKey = { ...item, __itemKey: `cfop-pending-${uniqueKey}` };

            byStatus[classification].push(itemWithKey);
            byStatus.all.push(itemWithKey);
        });
    
        const result: Record<ValidationStatus, Record<string, any[]>> = {
            all: {}, unvalidated: {}, correct: {}, incorrect: {}, verify: {}
        };
    
        for (const status of Object.keys(result) as ValidationStatus[]) {
            const statusItems = byStatus[status] || [];
            result[status] = statusItems.reduce((acc, item) => {
                const cfop = item.Sienge_CFOP || 'N/A';
                
                const currentFilters = tabFilters[cfop];
                let matchesFilters = true;
                if (currentFilters) {
                    const fullDescription = cfopDescriptions[parseInt(item.CFOP, 10) as keyof typeof cfopDescriptions] || "Descrição não encontrada";
                    matchesFilters = 
                        currentFilters.xmlCsts.has(String(item['CST do ICMS'] || '')) &&
                        currentFilters.xmlPicms.has(String(item.pICMS || '0')) &&
                        currentFilters.xmlCfopDescriptions.has(fullDescription);
                }
    
                if (matchesFilters) {
                    if (!acc[cfop]) acc[cfop] = [];
                    acc[cfop].push(item);
                }
                return acc;
            }, {} as Record<string, any[]>);
        }
    
        return result;
    }, [items, cfopValidations, tabFilters]);
    
    const numSelected = Object.keys(rowSelection).length;
    
    if (!items || items.length === 0) {
        return <p className="text-center text-muted-foreground p-8">Nenhum item conciliado para validar o CFOP.</p>;
    }
    
    const FilterDialog = ({ siengeCfop, items: dialogItems }: { siengeCfop: string; items: any[] }) => {
        const [isDialogOpen, setIsDialogOpen] = React.useState(false);

        const availableOptions = useMemo(() => {
            const xmlCsts = new Set<string>();
            const xmlPicms = new Set<string>();
            const xmlCfopDescriptions = new Set<string>();
            dialogItems.forEach(item => {
                if (item['CST do ICMS']) xmlCsts.add(String(item['CST do ICMS']));
                if (item.pICMS !== undefined) xmlPicms.add(String(item.pICMS));
                const fullDescription = cfopDescriptions[parseInt(item.CFOP, 10) as keyof typeof cfopDescriptions] || "Descrição não encontrada";
                if (fullDescription) xmlCfopDescriptions.add(fullDescription);
            });
            return {
                xmlCsts: Array.from(xmlCsts).sort(),
                xmlPicms: Array.from(xmlPicms).sort((a,b) => parseFloat(a) - parseFloat(b)),
                xmlCfopDescriptions: Array.from(xmlCfopDescriptions).sort(),
            };
        }, [dialogItems]);
        
        useEffect(() => {
            if (!tabFilters[siengeCfop]) {
                setTabFilters(prev => ({
                    ...prev,
                    [siengeCfop]: {
                        xmlCsts: new Set(availableOptions.xmlCsts),
                        xmlPicms: new Set(availableOptions.xmlPicms),
                        xmlCfopDescriptions: new Set(availableOptions.xmlCfopDescriptions),
                    }
                }));
            }
        }, [siengeCfop, availableOptions, tabFilters]);
        
        const filters = tabFilters[siengeCfop] || { xmlCsts: new Set(availableOptions.xmlCsts), xmlPicms: new Set(availableOptions.xmlPicms), xmlCfopDescriptions: new Set(availableOptions.xmlCfopDescriptions) };
        const isFilterActive = filters.xmlCsts.size < availableOptions.xmlCsts.length ||
                               filters.xmlPicms.size < availableOptions.xmlPicms.length ||
                               filters.xmlCfopDescriptions.size < availableOptions.xmlCfopDescriptions.length;

        const handleFilterChange = (type: keyof TabFilters, value: string, checked: boolean) => {
            setTabFilters(prev => {
                const newFilters: TabFilters = { ...(prev[siengeCfop] || { xmlCsts: new Set(), xmlPicms: new Set(), xmlCfopDescriptions: new Set() }) };
                
                const newSet = new Set(newFilters[type]);
                if (checked) {
                    newSet.add(value);
                } else {
                    newSet.delete(value);
                }
                return { ...prev, [siengeCfop]: { ...newFilters, [type]: newSet } };
            });
        };
        
        const clearFilters = () => {
             setTabFilters(prev => ({
                ...prev,
                [siengeCfop]: {
                    xmlCsts: new Set(availableOptions.xmlCsts),
                    xmlPicms: new Set(availableOptions.xmlPicms),
                    xmlCfopDescriptions: new Set(availableOptions.xmlCfopDescriptions),
                }
            }));
        };
        
        const FilterCheckboxList = ({ options, filterSet, filterKey }: { options: string[], filterSet: Set<string>, filterKey: keyof TabFilters }) => (
            <ScrollArea className="h-64">
                <div className="flex flex-col gap-2 mt-2 p-1">
                    {options.map(opt => (
                        <div key={`${filterKey}-${opt}`} className="flex items-center space-x-2">
                            <Checkbox id={`${filterKey}-${opt}`} checked={filterSet.has(opt)} onCheckedChange={checked => handleFilterChange(filterKey, opt, !!checked)} />
                            <Label htmlFor={`${filterKey}-${opt}`} className="text-sm font-normal">{filterKey === 'xmlPicms' ? `${parseFloat(opt).toFixed(2)}%` : opt}</Label>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        );

        return (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                    <Button variant={isFilterActive ? "secondary" : "outline"} size="sm" className="ml-4">
                        <ListFilter className="mr-2 h-4 w-4" /> Filtros
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-xl">
                     <DialogHeader>
                        <DialogTitle>Filtros Avançados</DialogTitle>
                        <DialogDescription>Desmarque os itens que deseja ocultar da visualização.</DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end">
                         <Button variant="ghost" size="sm" onClick={clearFilters}>Marcar Todos</Button>
                    </div>
                     <Tabs defaultValue="cfop_desc" className="w-full">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="cfop_desc">Descrição CFOP</TabsTrigger>
                            <TabsTrigger value="cst">CST ICMS</TabsTrigger>
                            <TabsTrigger value="picms">Alíquota ICMS</TabsTrigger>
                        </TabsList>
                        <TabsContent value="cfop_desc" className='mt-4'>
                             <FilterCheckboxList options={availableOptions.xmlCfopDescriptions} filterSet={filters.xmlCfopDescriptions} filterKey="xmlCfopDescriptions" />
                        </TabsContent>
                        <TabsContent value="cst" className='mt-4'>
                             <FilterCheckboxList options={availableOptions.xmlCsts} filterSet={filters.xmlCsts} filterKey="xmlCsts" />
                        </TabsContent>
                        <TabsContent value="picms" className='mt-4'>
                             <FilterCheckboxList options={availableOptions.xmlPicms} filterSet={filters.xmlPicms} filterKey="xmlPicms" />
                        </TabsContent>
                    </Tabs>
                     <DialogFooter>
                         <Button onClick={() => setIsDialogOpen(false)}>Aplicar e Fechar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        )
    };

    const statusTabs: { status: ValidationStatus; label: string }[] = [
        { status: 'all', label: 'Todos' },
        { status: 'unvalidated', label: 'Não Validado' },
        { status: 'correct', label: 'Correto' },
        { status: 'incorrect', label: 'Incorreto' },
        { status: 'verify', label: 'Verificar' },
    ];
    
    return (
        <div className='relative'>
            {numSelected > 0 && (
                <div className="sticky top-4 right-0 z-20 flex justify-end">
                    <Card className="flex items-center gap-4 p-2 shadow-lg animate-in fade-in-0 slide-in-from-top-5">
                        <span className="text-sm font-medium pl-2">{numSelected} selecionado(s)</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRowSelection({})}><MinusCircle className="h-4 w-4"/></Button>
                        <div className="h-6 border-l" />
                        <span className="text-sm font-medium">Ações em massa:</span>
                        <div className="flex gap-1">
                            <Button size="sm" onClick={() => handleBulkAction('correct')}><Check className="mr-2 h-4 w-4" /> Correto</Button>
                            <Button size="sm" variant="destructive" onClick={() => handleBulkAction('incorrect')}><X className="mr-2 h-4 w-4" /> Incorreto</Button>
                            <Button size="sm" variant="secondary" onClick={() => handleBulkAction('verify')}><HelpCircle className="mr-2 h-4 w-4" /> Verificar</Button>
                            <Button size="sm" variant="secondary" onClick={() => handleBulkAction('toggleDifal')}><Ticket className="mr-2 h-4 w-4" /> DIFAL</Button>
                        </div>
                    </Card>
                </div>
            )}
            <div className="flex justify-end gap-2 mb-4">
                <Button onClick={handleSaveChanges} disabled={!hasChanges}><Save className="mr-2 h-4 w-4" /> Guardar Validações</Button>
            </div>
            
            <Tabs value={activeStatusTab} onValueChange={(val) => setActiveStatusTab(val as ValidationStatus)} className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                     {statusTabs.map(({status, label}) => {
                         const count = (filteredItemsByStatusAndCfop[status] && Object.values(filteredItemsByStatusAndCfop[status]).flat().length) || 0;
                         return <TabsTrigger key={status} value={status} disabled={count === 0}>{label} ({count})</TabsTrigger>
                     })}
                </TabsList>
                {statusTabs.map(({ status }) => {
                    const cfopGroupsForStatus = filteredItemsByStatusAndCfop[status];
                    const cfopsForStatus = Object.keys(cfopGroupsForStatus).sort((a,b) => parseInt(a,10) - parseInt(b,10));

                     useEffect(() => {
                        if (status === activeStatusTab && cfopsForStatus.length > 0 && !activeCfopTabs[status]) {
                            setActiveCfopTabs(prev => ({...prev, [status]: cfopsForStatus[0]}));
                        }
                    }, [status, activeStatusTab, cfopsForStatus, activeCfopTabs]);

                    return (
                        <TabsContent key={status} value={status} className="mt-4">
                            {cfopsForStatus.length > 0 ? (
                                <Tabs 
                                    value={activeCfopTabs[status] || cfopsForStatus[0]} 
                                    onValueChange={(val) => setActiveCfopTabs(prev => ({...prev, [status]: val}))}
                                    className="w-full"
                                >
                                    <div className='flex justify-between items-center mb-2'>
                                        <TabsList className="h-auto flex-wrap justify-start">
                                            {cfopsForStatus.map(cfop => (
                                                <TabsTrigger key={`${status}-${cfop}`} value={cfop}>
                                                    {cfop} ({cfopGroupsForStatus[cfop].length})
                                                </TabsTrigger>
                                            ))}
                                        </TabsList>
                                         <Button onClick={() => handleDownload(Object.values(cfopGroupsForStatus).flat(), `Validacao_${status}`)} size="sm" variant="outline">
                                            <Download className="mr-2 h-4 w-4" /> Baixar Aba ({Object.values(cfopGroupsForStatus).flat().length})
                                        </Button>
                                    </div>
                                    {cfopsForStatus.map(cfop => {
                                        const currentCfopData = cfopGroupsForStatus[cfop] || [];
                                        return (
                                            <TabsContent key={`${status}-${cfop}`} value={cfop} className="mt-4">
                                                <div className='flex justify-between items-center mb-2'>
                                                    <div className='text-lg font-bold'>
                                                        {cfopDescriptions[parseInt(cfop, 10) as keyof typeof cfopDescriptions] || "Descrição não encontrada"}
                                                    </div>
                                                    <FilterDialog siengeCfop={cfop} items={currentCfopData} />
                                                </div>
                                                <DataTable columns={columns} data={currentCfopData} rowSelection={rowSelection} setRowSelection={setRowSelection} onSelectionChange={() => {}}/>
                                            </TabsContent>
                                        )
                                    })}
                                </Tabs>
                            ) : (
                                <div className="text-center text-muted-foreground p-8">Nenhum item nesta categoria.</div>
                            )}
                        </TabsContent>
                    )
                })}
            </Tabs>
        </div>
    );
}

