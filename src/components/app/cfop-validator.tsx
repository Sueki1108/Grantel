
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/components/app/columns-helper";
import { Check, X, HelpCircle, Save, RotateCw, ListFilter, SlidersHorizontal, Copy } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import type { AllClassifications, CfopClassification } from './imobilizado-analysis';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Label } from '../ui/label';
import { ScrollArea } from '../ui/scroll-area';
import { Checkbox } from '../ui/checkbox';
import { cfopDescriptions } from '@/lib/cfop';


interface CfopValidatorProps {
    items: any[];
    competence: string | null; 
    onPersistData: (allDataToSave: AllClassifications) => void;
    allPersistedData: AllClassifications;
}

type ValidationStatus = 'unvalidated' | 'correct' | 'incorrect' | 'verify';

type TabFilters = {
    xmlCfops: Set<string>;
    xmlCsts: Set<string>;
    xmlPicms: Set<string>;
    xmlCfopDescriptions: Set<string>;
};

export function CfopValidator({ items, competence, onPersistData, allPersistedData }: CfopValidatorProps) {
    const { toast } = useToast();
    
    const [cfopValidations, setCfopValidations] = useState<Record<string, CfopClassification>>({});
    const [hasChanges, setHasChanges] = useState(false);
    const [activeCfopTab, setActiveCfopTab] = useState('');
    const [activeStatusTabs, setActiveStatusTabs] = useState<Record<string, string>>({});
    const [tabFilters, setTabFilters] = useState<Record<string, TabFilters>>({});

    useEffect(() => {
        if (competence && allPersistedData[competence]?.cfopValidations?.classifications) {
            setCfopValidations(allPersistedData[competence].cfopValidations.classifications);
        } else {
            setCfopValidations({});
        }
        setHasChanges(false);
    }, [competence, allPersistedData]);


    const handleValidationChange = (uniqueKey: string, classification: ValidationStatus) => {
        const newValidations = { ...cfopValidations };
        newValidations[uniqueKey] = {
            ...(newValidations[uniqueKey] || { isDifal: false }),
            classification,
        };
        setCfopValidations(newValidations);
        setHasChanges(true);
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
    
    
    const groupedBySiengeCfop = useMemo(() => {
        return items.reduce((acc, item) => {
            const cfop = item.Sienge_CFOP || 'N/A';
            if (!acc[cfop]) acc[cfop] = [];
            acc[cfop].push(item);
            return acc;
        }, {} as Record<string, any[]>);
    }, [items]);

    useEffect(() => {
        const firstCfop = Object.keys(groupedBySiengeCfop)[0];
        if (firstCfop && !activeCfopTab) {
            setActiveCfopTab(firstCfop);
        }
    }, [groupedBySiengeCfop, activeCfopTab]);
    
    const copyToClipboard = (text: string | number, type: string) => {
        const textToCopy = String(text);
        navigator.clipboard.writeText(textToCopy).then(() => {
            toast({ title: `${type} copiad${type.endsWith('a') ? 'a' : 'o'}`, description: textToCopy });
        }).catch(() => {
            toast({ variant: 'destructive', title: `Falha ao copiar ${type}` });
        });
    };

    const columns = useMemo(() => getColumnsWithCustomRender(
        items,
        ['Número da Nota', 'Fornecedor', 'Descrição', 'CFOP', 'Descricao CFOP', 'CST do ICMS', 'pICMS', 'Valor Unitário', 'Valor Total'],
        (row, id) => {
            const value = row.original[id];

            // Render com ícone de cópia
            const renderCellWithCopy = (displayValue: React.ReactNode, copyValue: string | number, typeName: string) => (
                <div className="group flex items-center justify-between gap-1" onClick={(e) => e.stopPropagation()}>
                    <span className="truncate">{displayValue}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => copyToClipboard(copyValue, typeName)}>
                        <Copy className="h-3 w-3" />
                    </Button>
                </div>
            );
            
            // Render com tooltip
            const renderCellWithTooltip = (displayValue: string, fullValue: string) => (
                <TooltipProvider>
                    <Tooltip><TooltipTrigger asChild><span>{displayValue}</span></TooltipTrigger><TooltipContent><p>{fullValue}</p></TooltipContent></Tooltip>
                </TooltipProvider>
            );

            if (['Valor Total', 'Valor Unitário'].includes(id) && typeof value === 'number') {
                return <div className="text-right">{value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>;
            }
            
            if (id === 'pICMS') {
                return <div className='text-center'>{typeof value === 'number' ? `${value.toFixed(2)}%` : 'N/A'}</div>;
            }

            if (id === 'Número da Nota') {
                return renderCellWithCopy(String(value ?? ''), String(value ?? ''), 'Número da Nota');
            }

            if (id === 'Fornecedor') {
                const name = String(value || '');
                if (!name) return <div>N/A</div>;
                const summarizedName = name.length > 25 ? `${name.substring(0, 25)}...` : name;
                const display = renderCellWithTooltip(summarizedName, name);
                return renderCellWithCopy(display, name, 'Fornecedor');
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
            id: 'validation',
            header: 'Validação',
            cell: ({ row }) => {
                const uniqueKey = `${(row.original['CPF/CNPJ do Emitente'] || '').replace(/\\D/g, '')}-${(row.original['Código'] || '')}-${row.original['Sienge_CFOP']}`;
                const validation = cfopValidations[uniqueKey]?.classification || 'unvalidated';

                return (
                     <div className="flex gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
                        <TooltipProvider>
                            <Tooltip><TooltipTrigger asChild><Button size="icon" variant={validation === 'correct' ? 'default' : 'ghost'} className="h-8 w-8" onClick={() => handleValidationChange(uniqueKey, 'correct')}><Check className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Marcar como Correto</p></TooltipContent></Tooltip>
                            <Tooltip><TooltipTrigger asChild><Button size="icon" variant={validation === 'incorrect' ? 'destructive' : 'ghost'} className="h-8 w-8" onClick={() => handleValidationChange(uniqueKey, 'incorrect')}><X className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Marcar como Incorreto</p></TooltipContent></Tooltip>
                            <Tooltip><TooltipTrigger asChild><Button size="icon" variant={validation === 'verify' ? 'secondary' : 'ghost'} className="h-8 w-8" onClick={() => handleValidationChange(uniqueKey, 'verify')}><HelpCircle className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Marcar para Verificação</p></TooltipContent></Tooltip>
                            <Tooltip><TooltipTrigger asChild><Button size="icon" variant={validation === 'unvalidated' ? 'outline' : 'ghost'} className="h-8 w-8" onClick={() => handleValidationChange(uniqueKey, 'unvalidated')}><RotateCw className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Limpar Validação</p></TooltipContent></Tooltip>
                        </TooltipProvider>
                     </div>
                );
            }
        },
    ]), [items, cfopValidations]);

    const filterItems = (items: any[], status: 'all' | ValidationStatus, siengeCfop: string) => {
        const currentFilters = tabFilters[siengeCfop] || { xmlCfops: new Set(), xmlCsts: new Set(), xmlPicms: new Set(), xmlCfopDescriptions: new Set() };
        const statusFiltered = status === 'all'
            ? items
            : items.filter(item => {
                const uniqueKey = `${(item['CPF/CNPJ do Emitente'] || '').replace(/\\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}`;
                const classification = cfopValidations[uniqueKey]?.classification || 'unvalidated';
                return classification === status;
            });
        
        return statusFiltered.filter(item => {
            const cfopMatch = currentFilters.xmlCfops.size === 0 || currentFilters.xmlCfops.has(String(item.CFOP));
            const cstMatch = currentFilters.xmlCsts.size === 0 || currentFilters.xmlCsts.has(String(item['CST do ICMS']));
            const picmsMatch = currentFilters.xmlPicms.size === 0 || currentFilters.xmlPicms.has(String(item.pICMS || '0'));
            const descMatch = currentFilters.xmlCfopDescriptions.size === 0 || currentFilters.xmlCfopDescriptions.has(String(item['Descricao CFOP']));
            return cfopMatch && cstMatch && picmsMatch && descMatch;
        });
    };

    if (!items || items.length === 0) {
        return <p className="text-center text-muted-foreground p-8">Nenhum item conciliado para validar o CFOP.</p>;
    }
    
    const FilterPopover = ({ siengeCfop, items }: { siengeCfop: string; items: any[] }) => {
        const filters = tabFilters[siengeCfop] || { xmlCfops: new Set(), xmlCsts: new Set(), xmlPicms: new Set(), xmlCfopDescriptions: new Set() };
        const isFilterActive = filters.xmlCfops.size > 0 || filters.xmlCsts.size > 0 || filters.xmlPicms.size > 0 || filters.xmlCfopDescriptions.size > 0;

        const availableOptions = useMemo(() => {
            const xmlCfops = new Set<string>();
            const xmlCsts = new Set<string>();
            const xmlPicms = new Set<string>();
            const xmlCfopDescriptions = new Set<string>();
            items.forEach(item => {
                if (item.CFOP) xmlCfops.add(String(item.CFOP));
                if (item['CST do ICMS']) xmlCsts.add(String(item['CST do ICMS']));
                if (item.pICMS !== undefined) xmlPicms.add(String(item.pICMS));
                if (item['Descricao CFOP']) xmlCfopDescriptions.add(String(item['Descricao CFOP']));
            });
            return {
                xmlCfops: Array.from(xmlCfops).sort(),
                xmlCsts: Array.from(xmlCsts).sort(),
                xmlPicms: Array.from(xmlPicms).sort((a,b) => parseFloat(a) - parseFloat(b)),
                xmlCfopDescriptions: Array.from(xmlCfopDescriptions).sort(),
            };
        }, [items]);

        const handleFilterChange = (type: keyof TabFilters, value: string, checked: boolean) => {
            setTabFilters(prev => {
                const newFilters: TabFilters = { ...(prev[siengeCfop] || { xmlCfops: new Set(), xmlCsts: new Set(), xmlPicms: new Set(), xmlCfopDescriptions: new Set() }) };
                
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
                [siengeCfop]: { xmlCfops: new Set(), xmlCsts: new Set(), xmlPicms: new Set(), xmlCfopDescriptions: new Set() }
            }));
        };

        return (
            <Popover>
                <PopoverTrigger asChild>
                    <Button variant={isFilterActive ? "secondary" : "outline"} size="sm" className="ml-4">
                        <ListFilter className="mr-2 h-4 w-4" /> Filtros
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-96">
                    <div className="grid gap-4">
                         <div className="space-y-2">
                             <div className='flex justify-between items-center'>
                                <h4 className="font-medium leading-none">Filtros da Aba</h4>
                                <Button variant="ghost" size="sm" onClick={clearFilters} disabled={!isFilterActive}>Limpar</Button>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Refine os itens visíveis nesta aba.
                            </p>
                        </div>
                        <ScrollArea className="h-64">
                            <div className="grid gap-4 p-1">
                                <div>
                                    <Label className="font-semibold">CFOP do XML</Label>
                                    <div className="grid grid-cols-3 gap-2 mt-2">
                                        {availableOptions.xmlCfops.map(opt => (
                                            <div key={`cfop-${opt}`} className="flex items-center space-x-2">
                                                <Checkbox id={`cfop-${opt}`} checked={filters.xmlCfops.has(opt)} onCheckedChange={checked => handleFilterChange('xmlCfops', opt, !!checked)} />
                                                <Label htmlFor={`cfop-${opt}`}>{opt}</Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <Label className="font-semibold">Descrição CFOP (XML)</Label>
                                    <div className="flex flex-col gap-2 mt-2">
                                        {availableOptions.xmlCfopDescriptions.map(opt => (
                                            <div key={`desc-${opt}`} className="flex items-center space-x-2">
                                                <Checkbox id={`desc-${opt}`} checked={filters.xmlCfopDescriptions.has(opt)} onCheckedChange={checked => handleFilterChange('xmlCfopDescriptions', opt, !!checked)} />
                                                <Label htmlFor={`desc-${opt}`}>{opt}</Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                     <Label className="font-semibold">CST do ICMS (XML)</Label>
                                     <div className="grid grid-cols-3 gap-2 mt-2">
                                        {availableOptions.xmlCsts.map(opt => (
                                            <div key={`cst-${opt}`} className="flex items-center space-x-2">
                                                <Checkbox id={`cst-${opt}`} checked={filters.xmlCsts.has(opt)} onCheckedChange={checked => handleFilterChange('xmlCsts', opt, !!checked)} />
                                                <Label htmlFor={`cst-${opt}`}>{opt}</Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                 <div>
                                     <Label className="font-semibold">Alíquota ICMS (XML)</Label>
                                     <div className="grid grid-cols-3 gap-2 mt-2">
                                        {availableOptions.xmlPicms.map(opt => (
                                            <div key={`picms-${opt}`} className="flex items-center space-x-2">
                                                <Checkbox id={`picms-${opt}`} checked={filters.xmlPicms.has(opt)} onCheckedChange={checked => handleFilterChange('xmlPicms', opt, !!checked)} />
                                                <Label htmlFor={`picms-${opt}`}>{parseFloat(opt).toFixed(2)}%</Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </ScrollArea>
                    </div>
                </PopoverContent>
            </Popover>
        )
    };


    return (
        <div>
            <div className="flex justify-end gap-2 mb-4">
                <Button onClick={handleSaveChanges} disabled={!hasChanges}><Save className="mr-2 h-4 w-4" /> Guardar Validações</Button>
            </div>
            
            <Tabs value={activeCfopTab} onValueChange={setActiveCfopTab} className="w-full">
                <TabsList className="h-auto flex-wrap justify-start">
                    {Object.entries(groupedBySiengeCfop).map(([cfop, cfopItems]) => (
                        <TabsTrigger key={cfop} value={cfop}>
                            {cfop} ({cfopItems.length})
                        </TabsTrigger>
                    ))}
                </TabsList>
                {Object.entries(groupedBySiengeCfop).map(([cfop, cfopItems]) => {
                    const statusCounts = {
                        all: filterItems(cfopItems, 'all', cfop).length,
                        unvalidated: filterItems(cfopItems, 'unvalidated', cfop).length,
                        correct: filterItems(cfopItems, 'correct', cfop).length,
                        incorrect: filterItems(cfopItems, 'incorrect', cfop).length,
                        verify: filterItems(cfopItems, 'verify', cfop).length,
                    };
                    
                    const activeFilters = tabFilters[cfop];
                    const filterSummary = [
                        activeFilters?.xmlCfops.size > 0 && `CFOP: ${Array.from(activeFilters.xmlCfops).join(',')}`,
                        activeFilters?.xmlCfopDescriptions.size > 0 && `Desc: ${Array.from(activeFilters.xmlCfopDescriptions).join(',')}`,
                        activeFilters?.xmlCsts.size > 0 && `CST: ${Array.from(activeFilters.xmlCsts).join(',')}`,
                        activeFilters?.xmlPicms.size > 0 && `pICMS: ${Array.from(activeFilters.xmlPicms).join(',')}%`
                    ].filter(Boolean).join('; ');


                    return (
                        <TabsContent key={cfop} value={cfop} className="mt-4">
                             <Tabs 
                                value={activeStatusTabs[cfop] || 'all'} 
                                onValueChange={(val) => setActiveStatusTabs(prev => ({...prev, [cfop]: val}))} 
                                className="w-full"
                            >
                                <div className='flex justify-between items-center mb-2'>
                                     <TabsList className="h-auto flex-wrap justify-start">
                                        {statusCounts.all > 0 && <TabsTrigger value="all">Todos ({statusCounts.all})</TabsTrigger>}
                                        {statusCounts.unvalidated > 0 && <TabsTrigger value="unvalidated">Não Validado ({statusCounts.unvalidated})</TabsTrigger>}
                                        {statusCounts.correct > 0 && <TabsTrigger value="correct">Correto ({statusCounts.correct})</TabsTrigger>}
                                        {statusCounts.incorrect > 0 && <TabsTrigger value="incorrect">Incorreto ({statusCounts.incorrect})</TabsTrigger>}
                                        {statusCounts.verify > 0 && <TabsTrigger value="verify">Verificar ({statusCounts.verify})</TabsTrigger>}
                                    </TabsList>
                                    <div className='flex items-center gap-2'>
                                        {filterSummary && <Badge variant="secondary" className='hidden md:block'>{filterSummary}</Badge>}
                                        <FilterPopover siengeCfop={cfop} items={cfopItems} />
                                    </div>
                                </div>
                                <div className='text-sm text-muted-foreground italic my-2 px-1'>
                                    Descrição do CFOP da Aba: {cfopDescriptions[parseInt(cfop, 10) as keyof typeof cfopDescriptions] || "Descrição não encontrada"}
                                </div>
                                <TabsContent value="all" className="mt-4">
                                    <DataTable columns={columns} data={filterItems(cfopItems, 'all', cfop)} />
                                </TabsContent>
                                <TabsContent value="unvalidated" className="mt-4">
                                     <DataTable columns={columns} data={filterItems(cfopItems, 'unvalidated', cfop)} />
                                </TabsContent>
                                <TabsContent value="correct" className="mt-4">
                                     <DataTable columns={columns} data={filterItems(cfopItems, 'correct', cfop)} />
                                </TabsContent>
                                <TabsContent value="incorrect" className="mt-4">
                                     <DataTable columns={columns} data={filterItems(cfopItems, 'incorrect', cfop)} />
                                </TabsContent>
                                <TabsContent value="verify" className="mt-4">
                                     <DataTable columns={columns} data={filterItems(cfopItems, 'verify', cfop)} />
                                </TabsContent>
                            </Tabs>
                        </TabsContent>
                    );
                })}
            </Tabs>
        </div>
    );
}
