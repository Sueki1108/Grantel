"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/components/app/columns-helper";
import { Check, X, HelpCircle, RotateCw, ListFilter, Copy, Download, Factory, Wrench, HardHat, EyeOff, Settings, Ticket, Tag, RefreshCw, ChevronDown, ChevronRight, MinusCircle } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import type { AllClassifications, SupplierCategory } from '@/lib/types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cfopDescriptions } from '@/lib/cfop';
import { getCstDescription } from '@/lib/cst';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Label } from '../ui/label';
import { ScrollArea } from '../ui/scroll-area';
import { Checkbox } from '../ui/checkbox';
import * as XLSX from 'xlsx';
import { Card } from '../ui/card';
import type { RowSelectionState } from '@tanstack/react-table';
import { cn, cleanAndToStr } from '@/lib/utils';
import * as LucideIcons from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { SupplierCategoryDialog } from './supplier-category-dialog';


interface CfopValidatorProps {
    items: any[];
    originalXmlItems: any[]; // Pass original XML items for enrichment
    competence: string | null; 
    onPersistData: (allData: AllClassifications) => void;
    allPersistedData: AllClassifications;
}

type ValidationStatus = 'all' | 'unvalidated' | 'correct' | 'incorrect' | 'verify';

export type TabFilters = {
    xmlCsts: Set<string>;
    xmlPicms: Set<string>;
    xmlCfops: Set<string>;
};

type BulkActionState = {
    classification: 'correct' | 'incorrect' | 'verify' | 'unvalidated' | null;
    isDifal: boolean | null;
};

// ===============================================================
// Filter Dialog Component
// ===============================================================

const FilterDialog: React.FC<{
    siengeCfop: string;
    items: any[];
    tabFilters: Record<string, TabFilters>;
    setTabFilters: React.Dispatch<React.SetStateAction<Record<string, TabFilters>>>;
}> = ({ siengeCfop, items, tabFilters, setTabFilters }) => {
    const [isDialogOpen, setIsDialogOpen] = React.useState(false);

    const availableOptions = useMemo(() => {
        const xmlCsts = new Set<string>();
        const xmlPicms = new Set<string>();
        const xmlCfops = new Set<string>();
        items.forEach(item => {
            const cstCode = String(item['CST do ICMS'] || '');
            if(cstCode) {
                const cstDesc = getCstDescription(cstCode);
                xmlCsts.add(`${cstCode}: ${cstDesc}`);
            }

            if (item['Alíq. ICMS (%)'] !== undefined && item['Alíq. ICMS (%)'] !== null) xmlPicms.add(String(item['Alíq. ICMS (%)']));
            
            const cfopCode = item.CFOP;
            if (cfopCode) {
                const fullDescription = cfopDescriptions[parseInt(cfopCode, 10) as keyof typeof cfopDescriptions] || "N/A";
                const combined = `${cfopCode}: ${fullDescription}`;
                xmlCfops.add(combined);
            }
        });
        return {
            xmlCsts: Array.from(xmlCsts).sort(),
            xmlPicms: Array.from(xmlPicms).sort((a,b) => parseFloat(a) - parseFloat(b)),
            xmlCfops: Array.from(xmlCfops).sort(),
        };
    }, [items]);
    
    useEffect(() => {
        if (!tabFilters[siengeCfop]) {
            setTabFilters(prev => ({
                ...prev,
                [siengeCfop]: {
                    xmlCsts: new Set(availableOptions.xmlCsts),
                    xmlPicms: new Set(availableOptions.xmlPicms),
                    xmlCfops: new Set(availableOptions.xmlCfops),
                }
            }));
        }
    }, [siengeCfop, availableOptions, tabFilters, setTabFilters]);
    
    const filters = tabFilters[siengeCfop] || { xmlCsts: new Set(), xmlPicms: new Set(), xmlCfops: new Set() };
    const isFilterActive = (availableOptions.xmlCsts.length > 0 && filters.xmlCsts.size < availableOptions.xmlCsts.length) ||
                           (availableOptions.xmlPicms.length > 0 && filters.xmlPicms.size < availableOptions.xmlPicms.length) ||
                           (availableOptions.xmlCfops.length > 0 && filters.xmlCfops.size < availableOptions.xmlCfops.length);

    const handleFilterChange = (type: keyof TabFilters, value: string, checked: boolean) => {
        setTabFilters(prev => {
            const currentCfopFilters = prev[siengeCfop] || { xmlCsts: new Set(), xmlPicms: new Set(), xmlCfops: new Set() };
            const newSet = new Set(currentCfopFilters[type]);
            
            if (checked) {
                newSet.add(value);
            } else {
                newSet.delete(value);
            }
            return { 
                ...prev, 
                [siengeCfop]: { ...currentCfopFilters, [type]: newSet } 
            };
        });
    };
    
    const handleSelectAllForTab = (filterKey: keyof TabFilters, type: 'all' | 'none') => {
        setTabFilters(prev => {
            const currentCfopFilters = prev[siengeCfop] || { xmlCsts: new Set(), xmlPicms: new Set(), xmlCfops: new Set() };
            const newSet = type === 'all' ? new Set(availableOptions[filterKey as keyof typeof availableOptions]) : new Set<string>();
            return {
                ...prev,
                [siengeCfop]: { ...currentCfopFilters, [filterKey]: newSet }
            };
        });
    };

    return (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
                <Button variant={isFilterActive ? "secondary" : "outline"} size="sm" className="ml-4">
                    <ListFilter className="mr-2 h-4 w-4" /> Filtros
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
                 <DialogHeader>
                    <DialogTitle>Filtros Avançados para CFOP {siengeCfop}</DialogTitle>
                    <DialogDescription>Desmarque os itens que deseja ocultar da visualização.</DialogDescription>
                </DialogHeader>
                 <Tabs defaultValue='cfop' className='w-full'>
                    <TabsList className='grid grid-cols-3 w-full'>
                        <TabsTrigger value='cfop'>CFOP (XML)</TabsTrigger>
                        <TabsTrigger value='cst'>CST ICMS (XML)</TabsTrigger>
                        <TabsTrigger value='picms'>Alíquota ICMS (XML)</TabsTrigger>
                    </TabsList>
                    <div className="mt-4">
                        <TabsContent value='cfop'>
                            <div className="flex justify-end gap-2 mb-2">
                                <Button variant="ghost" size="sm" onClick={() => handleSelectAllForTab('xmlCfops', 'all')}>Marcar Todos</Button>
                                <Button variant="ghost" size="sm" onClick={() => handleSelectAllForTab('xmlCfops', 'none')}>Desmarcar Todos</Button>
                            </div>
                            <ScrollArea className='h-96 border rounded-md p-4'>
                                {availableOptions.xmlCfops.map(opt => (
                                    <div key={`cfop-${opt}`} className="flex items-start space-x-2 mb-2">
                                        <Checkbox id={`cfop-${opt}`} checked={(filters.xmlCfops || new Set()).has(opt)} onCheckedChange={checked => handleFilterChange('xmlCfops', opt, !!checked)} />
                                        <Label htmlFor={`cfop-${opt}`} className="text-sm font-normal cursor-pointer">{opt}</Label>
                                    </div>
                                ))}
                            </ScrollArea>
                        </TabsContent>
                         <TabsContent value='cst'>
                             <div className="flex justify-end gap-2 mb-2">
                                <Button variant="ghost" size="sm" onClick={() => handleSelectAllForTab('xmlCsts', 'all')}>Marcar Todos</Button>
                                <Button variant="ghost" size="sm" onClick={() => handleSelectAllForTab('xmlCsts', 'none')}>Desmarcar Todos</Button>
                            </div>
                             <ScrollArea className='h-96 border rounded-md p-4'>
                                {availableOptions.xmlCsts.map(opt => (
                                    <div key={`cst-${opt}`} className="flex items-center space-x-2 mb-2">
                                        <Checkbox id={`cst-${opt}`} checked={(filters.xmlCsts || new Set()).has(opt)} onCheckedChange={checked => handleFilterChange('xmlCsts', opt, !!checked)} />
                                        <Label htmlFor={`cst-${opt}`} className="text-sm font-normal">{opt}</Label>
                                    </div>
                                ))}
                            </ScrollArea>
                        </TabsContent>
                         <TabsContent value='picms'>
                             <div className="flex justify-end gap-2 mb-2">
                                <Button variant="ghost" size="sm" onClick={() => handleSelectAllForTab('xmlPicms', 'all')}>Marcar Todos</Button>
                                <Button variant="ghost" size="sm" onClick={() => handleSelectAllForTab('xmlPicms', 'none')}>Desmarcar Todos</Button>
                            </div>
                            <ScrollArea className='h-96 border rounded-md p-4'>
                                {availableOptions.xmlPicms.map(opt => (
                                    <div key={`picms-${opt}`} className="flex items-center space-x-2 mb-2">
                                        <Checkbox id={`picms-${opt}`} checked={(filters.xmlPicms || new Set()).has(opt)} onCheckedChange={checked => handleFilterChange('xmlPicms', opt, !!checked)} />
                                        <Label htmlFor={`picms-${opt}`} className="text-sm font-normal">{parseFloat(opt).toFixed(2)}%</Label>
                                    </div>
                                ))}
                            </ScrollArea>
                        </TabsContent>
                    </div>
                </Tabs>
                 <DialogFooter className="mt-4">
                     <Button onClick={() => setIsDialogOpen(false)}>Aplicar e Fechar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
};


// ===============================================================
// Main Component
// ===============================================================


export function CfopValidator({ items: initialItems, originalXmlItems, competence, onPersistData, allPersistedData }: CfopValidatorProps) {
    const { toast } = useToast();
    
    const [enrichedItems, setEnrichedItems] = useState(initialItems);
    const [activeStatusTab, setActiveStatusTab] = useState<ValidationStatus>('unvalidated');
    const [activeCfopTabs, setActiveCfopTabs] = useState<Record<string, string>>({});
    const [tabFilters, setTabFilters] = useState<Record<string, TabFilters>>({});
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const [bulkActionState, setBulkActionState] = useState<BulkActionState>({ classification: null, isDifal: null });

    useEffect(() => {
        // Reset enriched items when initial items change
        setEnrichedItems(initialItems);
    }, [initialItems]);

    const handleEnrichData = () => {
        if (!originalXmlItems || originalXmlItems.length === 0) {
            toast({ variant: 'destructive', title: 'Dados XML originais não encontrados.' });
            return;
        }

        const originalXmlItemsMap = new Map();
        originalXmlItems.forEach(item => {
            const key = `${item['Chave de acesso']}-${item['Item']}`;
            originalXmlItemsMap.set(key, item);
        });

        const newEnrichedItems = enrichedItems.map(item => {
            const key = `${item['Chave de acesso']}-${item['Item']}`;
            const originalItem = originalXmlItemsMap.get(key);
            if (originalItem) {
                return {
                    ...item,
                    'CST do ICMS': originalItem['CST do ICMS'] ?? item['CST do ICMS'],
                    'Alíq. ICMS (%)': originalItem['Alíq. ICMS (%)'] ?? item['Alíq. ICMS (%)'],
                    'CEST': originalItem['CEST'] ?? item['CEST'],
                };
            }
            return item;
        });
        
        setEnrichedItems(newEnrichedItems);
        toast({ title: 'Dados Enriquecidos!', description: 'As colunas de ICMS e CEST foram carregadas do XML.' });
    };

    const handleValidationChange = (
        itemsToUpdate: any[],
        newClassification: 'correct' | 'incorrect' | 'verify' | 'unvalidated'
    ) => {
        if (!competence) return;

        const updatedPersistedData = JSON.parse(JSON.stringify(allPersistedData));
        if (!updatedPersistedData[competence]) updatedPersistedData[competence] = { classifications: {}, accountCodes: {}, cfopValidations: { classifications: {} }};
        if (!updatedPersistedData[competence].cfopValidations) updatedPersistedData[competence].cfopValidations = { classifications: {} };
        
        itemsToUpdate.forEach(item => {
            const uniqueKey = `${(item['CPF/CNPJ do Emitente'] || '').replace(/\\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}`;
            const current = updatedPersistedData[competence].cfopValidations.classifications[uniqueKey] || { isDifal: false };
            updatedPersistedData[competence].cfopValidations.classifications[uniqueKey] = { ...current, classification: newClassification };
        });
        
        onPersistData(updatedPersistedData);
    };

    const handleDifalChange = (itemsToUpdate: any[]) => {
        if (!competence) return;
        const updatedPersistedData = JSON.parse(JSON.stringify(allPersistedData));
        if (!updatedPersistedData[competence]) updatedPersistedData[competence] = { classifications: {}, accountCodes: {}, cfopValidations: { classifications: {} }};
        if (!updatedPersistedData[competence].cfopValidations) updatedPersistedData[competence].cfopValidations = { classifications: {} };

        itemsToUpdate.forEach(item => {
            const uniqueKey = `${(item['CPF/CNPJ do Emitente'] || '').replace(/\\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}`;
            const current = updatedPersistedData[competence].cfopValidations.classifications[uniqueKey] || { classification: 'unvalidated', isDifal: false };
            updatedPersistedData[competence].cfopValidations.classifications[uniqueKey] = { ...current, isDifal: !current.isDifal };
        });
        
        onPersistData(updatedPersistedData);
    };
    
    const handleBulkAction = () => {
        const activeTableItems = itemsByStatus[activeStatusTab]?.[activeCfopTabs[activeStatusTab]] || [];
        const selectedItemKeys = Object.keys(rowSelection).map(index => activeTableItems[parseInt(index)].__itemKey);

        if (selectedItemKeys.length === 0) return;
        
        const selectedItems = selectedItemKeys.map(itemKey => {
            const uniqueKey = itemKey.replace('cfop-pending-', '');
            return enrichedItems.find(item => `${(item['CPF/CNPJ do Emitente'] || '').replace(/\\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}` === uniqueKey);
        }).filter(Boolean);

        let changedCount = 0;
        
        if (!competence) return;
        const updatedPersistedData = JSON.parse(JSON.stringify(allPersistedData));
        if (!updatedPersistedData[competence]) updatedPersistedData[competence] = { classifications: {}, accountCodes: {}, cfopValidations: { classifications: {} }};
        if (!updatedPersistedData[competence].cfopValidations) updatedPersistedData[competence].cfopValidations = { classifications: {} };
        const newValidations = updatedPersistedData[competence].cfopValidations.classifications;

        selectedItems.forEach(item => {
            if (!item) return;
            const uniqueKey = `${(item['CPF/CNPJ do Emitente'] || '').replace(/\\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}`;
            const current = { ...(newValidations[uniqueKey] || { classification: 'unvalidated', isDifal: false }) };
            let itemChanged = false;

            if (bulkActionState.classification) {
                if (current.classification !== bulkActionState.classification) {
                    current.classification = bulkActionState.classification;
                    itemChanged = true;
                }
            }
            if (bulkActionState.isDifal !== null) {
                if (current.isDifal !== bulkActionState.isDifal) {
                    current.isDifal = bulkActionState.isDifal;
                    itemChanged = true;
                }
            }
            
            if (itemChanged) {
                newValidations[uniqueKey] = current;
                changedCount++;
            }
        });

        if (changedCount > 0) {
            onPersistData(updatedPersistedData);
        }
        
        setBulkActionState({ classification: null, isDifal: null });
        setRowSelection({});
        toast({
            title: "Ações em Massa Aplicadas",
            description: `${changedCount} itens foram atualizados e guardados.`
        });
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

    const copyToClipboard = (text: string | number, type: string) => {
        const textToCopy = String(text);
        navigator.clipboard.writeText(textToCopy).then(() => {
            toast({ title: `${type} copiad${type.endsWith('a') ? 'a' : 'o'}`, description: textToCopy });
        }).catch(() => {
            toast({ variant: 'destructive', title: `Falha ao copiar ${type}` });
        });
    };
    
    const handleSupplierCategoryChange = (supplierCnpj: string, categoryId: string | null) => {
        if (!competence) return;

        const updatedData = { ...allPersistedData };
        if (!updatedData[competence]) {
            updatedData[competence] = { classifications: {}, accountCodes: {}, cfopValidations: { classifications: {} }, difalValidations: { classifications: {}}, supplierClassifications: {} };
        }
        if (!updatedData[competence].supplierClassifications) {
             updatedData[competence].supplierClassifications = {};
        }

        updatedData[competence].supplierClassifications![supplierCnpj] = categoryId;
        onPersistData(updatedData);
        toast({ title: 'Fornecedor classificado!' });
    };

    const handleSaveSupplierCategories = (categories: SupplierCategory[]) => {
         const updatedData = { ...allPersistedData };
         updatedData.supplierCategories = categories;
         onPersistData(updatedData);
    };

    const columns = useMemo(() => {
        if (!enrichedItems || enrichedItems.length === 0) return [];
        
        const columnsToShow: (keyof any)[] = ['Fornecedor', 'Número da Nota', 'Descrição', 'Centro de Custo', 'NCM', 'CEST', 'Sienge_Esp', 'CFOP', 'Alíq. ICMS (%)', 'CST do ICMS', 'Valor Total'];
        const cfopValidations = (competence && allPersistedData[competence]?.cfopValidations?.classifications) || {};
        const supplierCategories = allPersistedData.supplierCategories || [];
        const supplierClassifications = (competence && allPersistedData[competence]?.supplierClassifications) || {};
        
        return getColumnsWithCustomRender(
            enrichedItems,
            columnsToShow,
            (row, id) => {
                const item = row.original;
                const value = item[id as keyof typeof item];

                const renderCellWithCopy = (displayValue: React.ReactNode, copyValue: string | number, typeName: string) => (
                     <div className="flex items-center justify-between gap-1">
                        <span className="truncate">{displayValue}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={(e) => { e.stopPropagation(); copyToClipboard(copyValue, typeName); }}>
                            <Copy className="h-3 w-3" />
                        </Button>
                    </div>
                );
                
                if (id === 'Fornecedor') {
                    const supplierCnpj = item['CPF/CNPJ do Emitente'];
                    const supplierClassificationId = supplierClassifications[supplierCnpj];
                    const category = supplierCategories.find(c => c.id === supplierClassificationId);
                    
                    const LucideIcon = category?.icon ? (LucideIcons[category.icon as keyof typeof LucideIcons] as React.ElementType) : Tag;
                    const isAllowedCfop = !category || !category.allowedCfops || !Array.isArray(category.allowedCfops) || category.allowedCfops.length === 0 || category.allowedCfops.includes(String(item.CFOP));

                    return (
                         <div className="flex items-center gap-2 group/row">
                           <TooltipProvider>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <button onClick={(e) => e.stopPropagation()} className="transition-opacity">
                                        <Tooltip><TooltipTrigger asChild>
                                            <LucideIcon className={cn("h-4 w-4", !isAllowedCfop && "text-red-500", category && isAllowedCfop ? "text-primary" : "text-muted-foreground")} />
                                        </TooltipTrigger><TooltipContent><p>{category?.name || "Sem categoria"}</p></TooltipContent></Tooltip>
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-2" onClick={(e) => e.stopPropagation()}>
                                     <div className="space-y-1">
                                        {(supplierCategories || []).map(cat => (
                                            <Button key={cat.id} variant="ghost" size="sm" className="w-full justify-start" onClick={() => handleSupplierCategoryChange(supplierCnpj, cat.id)}>{cat.name}</Button>
                                        ))}
                                        <hr className="my-1"/>
                                        <Button variant="destructive" size="sm" className="w-full justify-start" onClick={() => handleSupplierCategoryChange(supplierCnpj, null)}>Remover Classificação</Button>
                                    </div>
                                </PopoverContent>
                            </Popover>
                            </TooltipProvider>
                            {renderCellWithCopy(value, value, 'Fornecedor')}
                        </div>
                    );
                }


                if (id === 'Número da Nota') {
                    return renderCellWithCopy(value, value, 'Número da Nota');
                }
                 if (id === 'Descrição') {
                    const summarizedDesc = typeof value === 'string' && value.length > 30 ? `${value.substring(0, 30)}...` : value;
                    return renderCellWithCopy(
                        <TooltipProvider><Tooltip><TooltipTrigger asChild><span>{summarizedDesc}</span></TooltipTrigger><TooltipContent><p>{value}</p></TooltipContent></Tooltip></TooltipProvider>,
                        value,
                        'Descrição'
                    );
                }

                if (id === 'Alíq. ICMS (%)') {
                    return <div className='text-center'>{typeof value === 'number' ? `${value.toFixed(2)}%` : 'N/A'}</div>;
                }

                if (['Valor Total'].includes(id) && typeof value === 'number') {
                    return <div className="text-right">{value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>;
                }

                if (id === 'CFOP') {
                    return (
                        <div className="flex items-center gap-1">
                            <span>{value}</span>
                        </div>
                    );
                }
                
                return <div>{String(value ?? '')}</div>;
            }
        ).concat([
            {
                id: 'actions',
                header: 'Ações',
                cell: ({ row }) => {
                    const uniqueKey = `${(row.original['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(row.original['Código'] || '')}-${row.original['Sienge_CFOP']}`;
                    const validation = cfopValidations[uniqueKey];
                    const classification = validation?.classification || 'unvalidated';
                    const isDifal = validation?.isDifal;

                    return (
                        <div className="flex justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                             <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            size="icon"
                                            variant={classification === 'correct' ? 'default' : 'ghost'}
                                            className={cn(
                                                "h-7 w-7",
                                                classification === 'correct' 
                                                ? "bg-emerald-600 text-white hover:bg-emerald-700" 
                                                : "text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
                                            )}
                                            onClick={() => handleValidationChange([row.original], 'correct')}
                                        >
                                            <Check className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>Correto</p></TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild><Button size="icon" variant={classification === 'incorrect' ? 'destructive' : 'ghost'} className={cn("h-7 w-7", classification === 'incorrect' ? 'bg-red-600 text-white hover:bg-red-700' : 'text-red-600 hover:bg-red-100 dark:hover:bg-red-900/50')} onClick={() => handleValidationChange([row.original], 'incorrect')}><X className="h-4 w-4" /></Button></TooltipTrigger>
                                    <TooltipContent><p>Incorreto</p></TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild><Button size="icon" variant={classification === 'verify' ? 'default' : 'ghost'} className={cn("h-7 w-7", classification === 'verify' ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/50')} onClick={() => handleValidationChange([row.original], 'verify')}><HelpCircle className="h-4 w-4" /></Button></TooltipTrigger>
                                    <TooltipContent><p>A Verificar</p></TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild><Button variant={isDifal ? 'default' : 'ghost'} size="icon" className={cn("h-7 w-7", isDifal && "bg-primary hover:bg-primary/90")} onClick={() => handleDifalChange([row.original])}><Ticket className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>{isDifal ? 'Desmarcar DIFAL' : 'Marcar como DIFAL'}</p></TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleValidationChange([row.original], 'unvalidated')}><RotateCw className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Limpar Validação</p></TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                    );
                }
            },
        ]);
    }, [enrichedItems, allPersistedData, competence, toast]);
    
    const itemsByStatus = useMemo(() => {
        const cfopValidations = (competence && allPersistedData[competence]?.cfopValidations?.classifications) || {};
        const result: Record<ValidationStatus, Record<string, any[]>> = {
            all: {}, unvalidated: {}, correct: {}, incorrect: {}, verify: {}
        };
    
        enrichedItems.forEach(item => {
            const uniqueKey = `${(item['CPF/CNPJ do Emitente'] || '').replace(/\\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}`;
            const classification = (cfopValidations[uniqueKey]?.classification) || 'unvalidated';
            const itemWithKey = { ...item, __itemKey: `cfop-pending-${uniqueKey}` };
            
            const cfop = item.Sienge_CFOP || 'N/A';

            if (!result.all[cfop]) result.all[cfop] = [];
            result.all[cfop].push(itemWithKey);

            if (!result[classification]) result[classification] = {};
            if (!result[classification][cfop]) result[classification][cfop] = [];
            result[classification][cfop].push(itemWithKey);
        });
        return result;
    }, [enrichedItems, competence, allPersistedData]);

    const numSelected = Object.keys(rowSelection).length;
    
    if (!initialItems || initialItems.length === 0) {
        return <p className="text-center text-muted-foreground p-8">Nenhum item conciliado para validar o CFOP.</p>;
    }
    
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
                <div className="sticky top-4 z-20 flex justify-end">
                    <Card className="flex items-center gap-2 p-2 shadow-lg animate-in fade-in-0 slide-in-from-top-5">
                        <span className="text-sm font-medium pl-2">{numSelected} selecionado(s)</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRowSelection({})}><X className="h-4 w-4"/></Button>
                        <div className="h-6 border-l" />
                        
                        <div className="flex gap-1">
                            <Button size="sm" className={cn("bg-secondary text-secondary-foreground", bulkActionState.classification === 'correct' && "bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-100")} onClick={() => setBulkActionState(prev => ({...prev, classification: 'correct'}))}><Check className="mr-2 h-4 w-4" /> Correto</Button>
                            <Button size="sm" className={cn("bg-secondary text-secondary-foreground", bulkActionState.classification === 'incorrect' && "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100")} onClick={() => setBulkActionState(prev => ({...prev, classification: 'incorrect'}))}><X className="mr-2 h-4 w-4" /> Incorreto</Button>
                            <Button size="sm" className={cn("bg-secondary text-secondary-foreground", bulkActionState.classification === 'verify' && "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-100")} onClick={() => setBulkActionState(prev => ({...prev, classification: 'verify'}))}><HelpCircle className="mr-2 h-4 w-4" /> Verificar</Button>
                            <Button size="sm" variant="outline" onClick={() => setBulkActionState(prev => ({...prev, classification: 'unvalidated'}))}><RotateCw className="mr-2 h-4 w-4" /> Reverter</Button>
                            <Button size="sm" variant={bulkActionState.isDifal ? 'default' : 'outline'} onClick={() => setBulkActionState(prev => ({...prev, isDifal: prev.isDifal === null ? true : !prev.isDifal}))}><Ticket className="mr-2 h-4 w-4" /> DIFAL</Button>
                        </div>
                         <Button onClick={handleBulkAction}>Aplicar</Button>
                    </Card>
                </div>
            )}
            
            <Tabs value={activeStatusTab} onValueChange={(val) => setActiveStatusTab(val as ValidationStatus)} className="w-full">
                 <div className="flex justify-between items-center mb-2">
                    <TabsList className="grid w-full grid-cols-5">
                        {statusTabs.map(({status, label}) => {
                            const count = Object.values(itemsByStatus[status] || {}).flat().length;
                            return <TabsTrigger key={status} value={status} disabled={count === 0}>{label} ({count})</TabsTrigger>
                        })}
                    </TabsList>
                    <div className="flex gap-2 ml-4">
                        <Button onClick={handleEnrichData} variant="outline" size="sm"><RefreshCw className="mr-2 h-4 w-4" />Carregar ICMS/CEST do XML</Button>
                         <SupplierCategoryDialog 
                            categories={allPersistedData.supplierCategories || []} 
                            onSave={handleSaveSupplierCategories}
                         />
                    </div>
                </div>
                {statusTabs.map(({ status }) => {
                    const cfopGroupsForStatus = itemsByStatus[status] || {};
                    const allCfopsForStatus = Object.keys(cfopGroupsForStatus).sort((a,b) => parseInt(a,10) - parseInt(b,10));

                     useEffect(() => {
                        const currentCfopTab = activeCfopTabs[status];
                        const cfopData = cfopGroupsForStatus[currentCfopTab] || [];
                        const filteredCount = !tabFilters[currentCfopTab] ? cfopData.length : cfopData.filter((item: any) => {
                            const currentFilters = tabFilters[currentCfopTab];
                            if(!currentFilters) return true;
                            const cfopCode = item.CFOP;
                            const fullDescription = cfopDescriptions[parseInt(cfopCode, 10) as keyof typeof cfopDescriptions] || "N/A";
                            const combinedCfop = `${cfopCode}: ${fullDescription}`;
                            const cstCode = String(item['CST do ICMS'] || '');
                            const cstDesc = getCstDescription(cstCode);
                            const combinedCst = `${cstCode}: ${cstDesc}`;
                            const picmsValue = String(item['Alíq. ICMS (%)'] ?? 'null');

                            const cfopFilterOk = currentFilters.xmlCfops.size === 0 || currentFilters.xmlCfops.has(combinedCfop);
                            const cstFilterOk = currentFilters.xmlCsts.size === 0 || currentFilters.xmlCsts.has(combinedCst);
                            const picmsFilterOk = currentFilters.xmlPicms.size === 0 || currentFilters.xmlPicms.has(picmsValue);
                            
                            return cstFilterOk && picmsFilterOk && cfopFilterOk;
                        }).length;

                        if (status === activeStatusTab && allCfopsForStatus.length > 0 && (!allCfopsForStatus.includes(activeCfopTabs[status]) || filteredCount === 0)) {
                            const firstVisibleTab = allCfopsForStatus.find(cfop => (cfopGroupsForStatus[cfop] || []).length > 0);
                            if(firstVisibleTab) setActiveCfopTabs(prev => ({...prev, [status]: firstVisibleTab}));
                        }
                    }, [status, activeStatusTab, allCfopsForStatus, activeCfopTabs, tabFilters, cfopGroupsForStatus]);

                    return (
                        <TabsContent key={status} value={status} className="mt-4">
                            {allCfopsForStatus.length > 0 ? (
                                <Tabs 
                                    value={activeCfopTabs[status] || allCfopsForStatus[0]} 
                                    onValueChange={(val) => setActiveCfopTabs(prev => ({...prev, [status]: val}))}
                                    className="w-full"
                                >
                                    <div className='flex justify-between items-center mb-2'>
                                        <TabsList className="h-auto flex-wrap justify-start">
                                            {allCfopsForStatus.map(cfop => {
                                                const totalItemsInCfop = (itemsByStatus[status]?.[cfop] || []).length;
                                                return <TabsTrigger key={`${status}-${cfop}`} value={cfop} disabled={totalItemsInCfop === 0}>{cfop} ({totalItemsInCfop})</TabsTrigger>
                                            })}
                                        </TabsList>
                                         <Button onClick={() => handleDownload(Object.values(cfopGroupsForStatus).flat(), `Validacao_${status}`)} size="sm" variant="outline" disabled={Object.values(cfopGroupsForStatus).flat().length === 0}>
                                            <Download className="mr-2 h-4 w-4" /> Baixar Aba ({Object.values(cfopGroupsForStatus).flat().length})
                                        </Button>
                                    </div>
                                    {allCfopsForStatus.map(cfop => {
                                        const currentFilters = tabFilters[cfop];
                                        const currentCfopData = itemsByStatus[status]?.[cfop]?.filter(item => {
                                            if (!currentFilters) return true;
                                            
                                            const cfopCode = item.CFOP;
                                            const fullDescription = cfopDescriptions[parseInt(cfopCode, 10) as keyof typeof cfopDescriptions] || "N/A";
                                            const combinedCfop = `${cfopCode}: ${fullDescription}`;

                                            const cstCode = String(item['CST do ICMS'] || '');
                                            const cstDesc = getCstDescription(cstCode);
                                            const combinedCst = `${cstCode}: ${cstDesc}`;

                                            const picmsValue = String(item['Alíq. ICMS (%)'] ?? 'null');

                                            const cfopFilterOk = currentFilters.xmlCfops.size === 0 || currentFilters.xmlCfops.has(combinedCfop);
                                            const cstFilterOk = currentFilters.xmlCsts.size === 0 || currentFilters.xmlCsts.has(combinedCst);
                                            const picmsFilterOk = currentFilters.xmlPicms.size === 0 || currentFilters.xmlPicms.has(picmsValue);
                                            
                                            return cstFilterOk && picmsFilterOk && cfopFilterOk;
                                        }) || [];

                                        return (
                                            <TabsContent key={`${status}-${cfop}`} value={cfop} className="mt-4">
                                                <div className='flex justify-between items-center mb-2'>
                                                    <div className='text-lg font-bold'>
                                                        {cfopDescriptions[parseInt(cfop, 10) as keyof typeof cfopDescriptions] || "Descrição não encontrada"}
                                                    </div>
                                                    <FilterDialog siengeCfop={cfop} items={itemsByStatus[status]?.[cfop] || []} tabFilters={tabFilters} setTabFilters={setTabFilters} />
                                                </div>
                                                <DataTable columns={columns} data={currentCfopData} rowSelection={rowSelection} setRowSelection={setRowSelection} autoResetPageIndex={false} />
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


    
