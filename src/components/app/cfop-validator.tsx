
"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/components/app/columns-helper";
import { Check, X, HelpCircle, RotateCw, ListFilter, Copy, Download, Factory, Wrench, HardHat, Settings, Ticket, Tag, RefreshCw, ChevronDown, ChevronRight, MinusCircle, Cpu, EyeOff, ShieldCheck, TicketX } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import type { AllClassifications, SupplierCategory, Classification, DifalStatus } from '@/lib/types';
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
import { cn, cleanAndToStr, normalizeKey } from '@/lib/utils';
import * as LucideIcons from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { SupplierCategoryDialog } from './supplier-category-dialog';


interface CfopValidatorProps {
    items: any[];
    nfeValidasData: any[]; // Pass NFe data for enrichment
    originalXmlItems: any[];
    itensSaidas: any[];
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
    const [localFilters, setLocalFilters] = React.useState<TabFilters>({ xmlCsts: new Set(), xmlPicms: new Set(), xmlCfops: new Set() });

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
            
            const cfopCode = item['CFOP']; 
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
        if (isDialogOpen) {
            const currentGlobalFilters = tabFilters[siengeCfop] || {
                xmlCsts: new Set(availableOptions.xmlCsts),
                xmlPicms: new Set(availableOptions.xmlPicms),
                xmlCfops: new Set(availableOptions.xmlCfops),
            };
             // Deep copy to prevent unintended mutations
            const deepCopiedFilters = {
                xmlCsts: new Set(currentGlobalFilters.xmlCsts),
                xmlPicms: new Set(currentGlobalFilters.xmlPicms),
                xmlCfops: new Set(currentGlobalFilters.xmlCfops),
            };
            setLocalFilters(deepCopiedFilters);
        }
    }, [isDialogOpen, tabFilters, siengeCfop, availableOptions]);
    
    const filters = tabFilters[siengeCfop] || { xmlCsts: new Set(), xmlPicms: new Set(), xmlCfops: new Set() };
    const isFilterActive = filters.xmlCsts?.size < availableOptions.xmlCsts.length ||
                           filters.xmlPicms?.size < availableOptions.xmlPicms.length ||
                           filters.xmlCfops?.size < availableOptions.xmlCfops.length;


    const handleFilterChange = (type: keyof TabFilters, value: string, checked: boolean) => {
        setLocalFilters(prev => {
            const newSet = new Set(prev[type]);
            if (checked) {
                newSet.add(value);
            } else {
                newSet.delete(value);
            }
            return { ...prev, [type]: newSet };
        });
    };
    
    const handleSelectAllForTab = (filterKey: keyof TabFilters, type: 'all' | 'none') => {
         setLocalFilters(prev => {
            const newSet = type === 'all' ? new Set(availableOptions[filterKey as keyof typeof availableOptions]) : new Set<string>();
            return { ...prev, [filterKey]: newSet };
        });
    };
    
    const handleApplyFilters = () => {
        setTabFilters(prev => ({
            ...prev,
            [siengeCfop]: localFilters,
        }));
        setIsDialogOpen(false);
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
                                        <Checkbox id={`cfop-${opt}`} checked={localFilters?.xmlCfops.has(opt)} onCheckedChange={checked => handleFilterChange('xmlCfops', opt, !!checked)} />
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
                                        <Checkbox id={`cst-${opt}`} checked={localFilters?.xmlCsts.has(opt)} onCheckedChange={checked => handleFilterChange('xmlCsts', opt, !!checked)} />
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
                                        <Checkbox id={`picms-${opt}`} checked={localFilters?.xmlPicms.has(opt)} onCheckedChange={checked => handleFilterChange('xmlPicms', opt, !!checked)} />
                                        <Label htmlFor={`picms-${opt}`} className="text-sm font-normal">{parseFloat(opt).toFixed(2)}%</Label>
                                    </div>
                                ))}
                            </ScrollArea>
                        </TabsContent>
                    </div>
                </Tabs>
                 <DialogFooter className="mt-4">
                     <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                     <Button onClick={handleApplyFilters}>Aplicar e Fechar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
};


// ===============================================================
// Main Component
// ===============================================================


export function CfopValidator(props: CfopValidatorProps) {
    const { items: initialItems, nfeValidasData, originalXmlItems, itensSaidas, competence, onPersistData, allPersistedData } = props;
    const { toast } = useToast();
    
    const [enrichedItems, setEnrichedItems] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<ValidationStatus | 'faturamento-entrega' | 'difal-analysis'>('unvalidated');
    const [activeCfopTabs, setActiveCfopTabs] = useState<Record<string, string>>({});
    const [tabFilters, setTabFilters] = useState<Record<string, TabFilters>>({});
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const [bulkActionState, setBulkActionState] = useState<BulkActionState>({ classification: null });
    const [itemsEntregaFutura, setItemsEntregaFutura] = useState<any[]>([]);
    const [itemsSimplesFaturamento, setItemsSimplesFaturamento] = useState<any[]>([]);
    const [isLoadingSpecialCfops, setIsLoadingSpecialCfops] = useState(false);


    useEffect(() => {
        if (!initialItems) {
            setEnrichedItems([]);
            return;
        }

        const newItems = initialItems.map(item => {
            const header = (nfeValidasData || []).find(n => n['Chave Unica'] === item['Chave Unica']);
            return {
                ...item,
                Fornecedor: header?.Fornecedor || item.Fornecedor || 'N/A',
            };
        });
        setEnrichedItems(newItems);

    }, [initialItems, nfeValidasData]);

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
                    'Alíq. ICMS (%)': originalItem['pICMS'] ?? item['Alíq. ICMS (%)'],
                    'CEST': originalItem['prod_CEST'] ?? item['CEST'],
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
            const uniqueKey = `${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}`;
            const current = updatedPersistedData[competence].cfopValidations.classifications[uniqueKey] || { isDifal: false };
            updatedPersistedData[competence].cfopValidations.classifications[uniqueKey] = { ...current, classification: newClassification };
        });
        
        onPersistData(updatedPersistedData);
    };

    const handleDifalStatusChange = (itemsToUpdate: any[], status: DifalStatus) => {
        if (!competence) return;
        const updatedPersistedData = JSON.parse(JSON.stringify(allPersistedData));
        if (!updatedPersistedData[competence]) {
            updatedPersistedData[competence] = { classifications: {}, accountCodes: {}, cfopValidations: { classifications: {} }, difalValidations: { classifications: {}} };
        }
        if (!updatedPersistedData[competence].difalValidations) {
            updatedPersistedData[competence].difalValidations = { classifications: {} };
        }

        itemsToUpdate.forEach(item => {
            const itemKey = `${item['Chave de acesso']}-${item['Item']}`;
            updatedPersistedData[competence].difalValidations!.classifications[itemKey] = { status };
        });

        onPersistData(updatedPersistedData);
    };
    
    const handleBulkAction = () => {
        const activeTableItems = itemsByStatus[activeTab as ValidationStatus]?.[activeCfopTabs[activeTab]] || [];
        const selectedItemKeys = Object.keys(rowSelection).map(index => activeTableItems[parseInt(index)].__itemKey);

        if (selectedItemKeys.length === 0) return;
        
        const selectedItems = selectedItemKeys.map(itemKey => {
            const uniqueKey = itemKey.replace('cfop-pending-', '');
            return enrichedItems.find(item => `${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}` === uniqueKey);
        }).filter(Boolean);

        let changedCount = 0;
        
        if (!competence) return;
        const updatedPersistedData = JSON.parse(JSON.stringify(allPersistedData));
        if (!updatedPersistedData[competence]) updatedPersistedData[competence] = { classifications: {}, accountCodes: {}, cfopValidations: { classifications: {} }};
        if (!updatedPersistedData[competence].cfopValidations) updatedPersistedData[competence].cfopValidations = { classifications: {} };
        const newValidations = updatedPersistedData[competence].cfopValidations.classifications;

        selectedItems.forEach(item => {
            if (!item) return;
            const uniqueKey = `${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}`;
            const current = { ...(newValidations[uniqueKey] || { classification: 'unvalidated' }) };
            let itemChanged = false;

            if (bulkActionState.classification && current.classification !== bulkActionState.classification) {
                current.classification = bulkActionState.classification;
                itemChanged = true;
            }
            
            if (itemChanged) {
                newValidations[uniqueKey] = current;
                changedCount++;
            }
        });

        if (changedCount > 0) {
            onPersistData(updatedPersistedData);
        }
        
        setBulkActionState({ classification: null });
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

    const handleLoadSpecialCfops = React.useCallback(() => {
        setIsLoadingSpecialCfops(true);
        setTimeout(() => {
            const ENTREGA_FUTURA_CFOPS = ['5116', '5117', '6116', '6117'];
            const SIMPLES_FATURAMENTO_CFOPS = ['5922', '6922'];
        
            if (!originalXmlItems || originalXmlItems.length === 0) {
                 toast({ variant: 'destructive', title: 'Fonte de Dados Vazia', description: 'Não há itens de XML de entrada para analisar.' });
                 setIsLoadingSpecialCfops(false);
                 return;
            }

            const entregaFutura = originalXmlItems.filter((item: any) => 
                ENTREGA_FUTURA_CFOPS.includes(item['CFOP'])
            ).map((item, index) => ({...item, '__itemKey': `entrega-futura-${index}`}));
            
            const simplesFaturamento = originalXmlItems.filter((item: any) => 
                SIMPLES_FATURAMENTO_CFOPS.includes(item['CFOP'])
            ).map((item, index) => ({...item, '__itemKey': `simples-faturamento-${index}`}));

            setItemsEntregaFutura(entregaFutura);
            setItemsSimplesFaturamento(simplesFaturamento);
            setIsLoadingSpecialCfops(false);
            
            if (entregaFutura.length > 0 || simplesFaturamento.length > 0) {
                 toast({ title: 'Análise Concluída', description: 'As notas de faturamento e entrega futura foram carregadas.' });
            } else {
                 toast({ variant: 'destructive', title: 'Nenhum Item Encontrado', description: 'Nenhum item com os CFOPs de saída especificados foi encontrado nos XMLs de entrada.' });
            }
        }, 50);
    }, [originalXmlItems, toast]);


    const columns = useMemo(() => {
        if (!enrichedItems || enrichedItems.length === 0) return [];
        
        const columnsToShow: (keyof any)[] = ['Fornecedor', 'Número da Nota', 'Descrição', 'Centro de Custo', 'Contabilização', 'NCM', 'CEST', 'Sienge_Esp', 'CFOP', 'CFOP (Sienge)', 'Alíq. ICMS (%)', 'CST do ICMS', 'Valor Total'];
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
                    const isAllowedCfop = !category || !category.allowedCfops || !Array.isArray(category.allowedCfops) || category.allowedCfops.length === 0 || category.allowedCfops.includes(String(item['CFOP']));

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
                                    <TooltipTrigger asChild><Button size="icon" variant={classification === 'verify' ? 'default' : 'ghost'} className={cn("h-7 w-7", classification === 'verify' ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/50')} onClick={() => handleValidationChange([row.original], 'verify')}><HelpCircle className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>A Verificar</p></TooltipContent>
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
        
        const statusResult: Record<ValidationStatus, Record<string, any[]>> = {
            all: {}, unvalidated: {}, correct: {}, incorrect: {}, verify: {}
        };
        
        enrichedItems.forEach(item => {
            const uniqueKey = `${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}`;
            const validation = cfopValidations[uniqueKey];
            const classification = validation?.classification || 'unvalidated';
            const itemWithKey = { ...item, __itemKey: `cfop-pending-${uniqueKey}` };
            const siengeCfop = item.Sienge_CFOP || 'N/A';

            if (!statusResult.all[siengeCfop]) statusResult.all[siengeCfop] = [];
            statusResult.all[siengeCfop].push(itemWithKey);

            if (!statusResult[classification][siengeCfop]) statusResult[classification][siengeCfop] = [];
            statusResult[classification][siengeCfop].push(itemWithKey);
        });
        return statusResult;
    }, [enrichedItems, competence, allPersistedData]);


    const difalAnalysisData = useMemo(() => {
        const difalValidations = (competence && allPersistedData[competence]?.difalValidations?.classifications) || {};
        const correctItems = Object.values(itemsByStatus.correct).flat();
        
        const sujeitosAoDifal = correctItems.filter(item => 
            item['CFOP'] === '2551' || item['CFOP'] === '2556'
        ).map(item => ({...item, __itemKey: `${item['Chave de acesso']}-${item['Item']}`}));

        const difalItems = [];
        const desconsideradosItems = [];
        const beneficioFiscalItems = [];
        
        sujeitosAoDifal.forEach(item => {
            const itemKey = `${item['Chave de acesso']}-${item['Item']}`;
            const status = difalValidations[itemKey]?.status;
            switch(status) {
                case 'difal':
                    difalItems.push(item);
                    break;
                case 'disregard':
                    desconsideradosItems.push(item);
                    break;
                case 'beneficio-fiscal':
                    beneficioFiscalItems.push(item);
                    break;
                default:
                    // fica nos sujeitos
                    break;
            }
        });

        // Filter out items that have been moved to other tabs
        const finalSujeitos = sujeitosAoDifal.filter(item => {
             const itemKey = `${item['Chave de acesso']}-${item['Item']}`;
             return !difalValidations[itemKey];
        });

        return { sujeitosAoDifal: finalSujeitos, difalItems, desconsideradosItems, beneficioFiscalItems };

    }, [itemsByStatus.correct, allPersistedData, competence]);


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
    
    const activeCfopTab = activeCfopTabs[activeTab as ValidationStatus];
    const cfopGroupsForStatus = itemsByStatus[activeTab as ValidationStatus] || {};
    const allCfopsForStatus = Object.keys(cfopGroupsForStatus).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    
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
                        </div>
                         <Button onClick={handleBulkAction}>Aplicar</Button>
                    </Card>
                </div>
            )}
            
            <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as ValidationStatus | 'faturamento-entrega' | 'difal-analysis')} className="w-full">
                 <div className="flex justify-between items-center mb-2">
                    <TabsList className="grid w-full grid-cols-7">
                        {statusTabs.map(({status, label}) => {
                            const count = Object.values(itemsByStatus[status] || {}).flat().length;
                            return <TabsTrigger key={status} value={status} disabled={count === 0}>{label} ({count})</TabsTrigger>
                        })}
                         <TabsTrigger value="faturamento-entrega">Faturamento/Entrega</TabsTrigger>
                         <TabsTrigger value="difal-analysis">Análise DIFAL</TabsTrigger>
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
                                        const allItemsForCfop = cfopGroupsForStatus[cfop] || [];
                                        const currentFilters = tabFilters[cfop];
                                        
                                        const currentCfopData = allItemsForCfop.filter(item => {
                                             if (!currentFilters) return true;
                                            
                                            const cfopCode = item['CFOP'];
                                            const cstCode = String(item['CST do ICMS'] || '');
                                            const picmsValue = String(item['Alíq. ICMS (%)'] ?? 'null');

                                            const cfopMatch = currentFilters.xmlCfops.size === 0 || currentFilters.xmlCfops.has(`${cfopCode}: ${cfopDescriptions[parseInt(cfopCode, 10) as keyof typeof cfopDescriptions] || "N/A"}`);
                                            const cstMatch = currentFilters.xmlCsts.size === 0 || currentFilters.xmlCsts.has(`${cstCode}: ${getCstDescription(cstCode)}`);
                                            const picmsMatch = currentFilters.xmlPicms.size === 0 || currentFilters.xmlPicms.has(picmsValue);

                                            return cfopMatch && cstMatch && picmsMatch;
                                        });

                                        return (
                                            <TabsContent key={`${status}-${cfop}`} value={cfop} className="mt-4">
                                                <div className='flex justify-between items-center mb-2'>
                                                    <div className='text-lg font-bold'>
                                                        {cfopDescriptions[parseInt(cfop, 10) as keyof typeof cfopDescriptions] || "Descrição não encontrada"}
                                                    </div>
                                                    <FilterDialog siengeCfop={cfop} items={allItemsForCfop} tabFilters={tabFilters} setTabFilters={setTabFilters} />
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
                <TabsContent value="faturamento-entrega" className="mt-4">
                     <div className="flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-lg mb-6">
                        <p className="text-muted-foreground mb-4">Clique no botão para analisar as notas de Entrega Futura e Simples Faturamento dos itens de entrada (CFOPs do fornecedor).</p>
                        <Button onClick={handleLoadSpecialCfops} disabled={isLoadingSpecialCfops}>
                            {isLoadingSpecialCfops ? <><Cpu className="mr-2 h-4 w-4 animate-spin" />Analisando...</> : <><Cpu className="mr-2 h-4 w-4" />Analisar Faturamento/Entrega</>}
                        </Button>
                    </div>

                    <Tabs defaultValue="entrega-futura">
                        <TabsList className="grid w-full grid-cols-2">
                             <TabsTrigger value="entrega-futura">Entrega Futura ({itemsEntregaFutura.length})</TabsTrigger>
                             <TabsTrigger value="simples-faturamento">Simples Faturamento ({itemsSimplesFaturamento.length})</TabsTrigger>
                        </TabsList>
                        <TabsContent value="entrega-futura" className="mt-4">
                            <DataTable columns={columns} data={itemsEntregaFutura} rowSelection={rowSelection} setRowSelection={setRowSelection} />
                        </TabsContent>
                        <TabsContent value="simples-faturamento" className="mt-4">
                            <DataTable columns={columns} data={itemsSimplesFaturamento} rowSelection={rowSelection} setRowSelection={setRowSelection} />
                        </TabsContent>
                    </Tabs>
                </TabsContent>
                <TabsContent value="difal-analysis" className="mt-4">
                    <Tabs defaultValue="sujeitos">
                        <TabsList className="grid w-full grid-cols-4">
                            <TabsTrigger value="sujeitos">Sujeitos ao DIFAL ({difalAnalysisData.sujeitosAoDifal.length})</TabsTrigger>
                            <TabsTrigger value="difal">DIFAL ({difalAnalysisData.difalItems.length})</TabsTrigger>
                            <TabsTrigger value="beneficio-fiscal">Benefício Fiscal ({difalAnalysisData.beneficioFiscalItems.length})</TabsTrigger>
                            <TabsTrigger value="desconsiderados">Desconsiderados ({difalAnalysisData.desconsideradosItems.length})</TabsTrigger>
                        </TabsList>
                         <TabsContent value="sujeitos" className="mt-4">
                            <DataTable columns={[...columns, { id: 'difal-actions', header: 'Ações DIFAL', cell: ({row}) => (
                                <div className="flex justify-center gap-1">
                                    <TooltipProvider>
                                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600" onClick={() => handleDifalStatusChange([row.original], 'difal')}><Ticket className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Marcar como DIFAL</p></TooltipContent></Tooltip>
                                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-gray-500" onClick={() => handleDifalStatusChange([row.original], 'disregard')}><EyeOff className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Desconsiderar</p></TooltipContent></Tooltip>
                                    </TooltipProvider>
                                </div>
                            )}]} data={difalAnalysisData.sujeitosAoDifal} />
                        </TabsContent>
                         <TabsContent value="difal" className="mt-4">
                            <DataTable columns={[...columns, { id: 'difal-actions', header: 'Ações DIFAL', cell: ({row}) => (
                                <div className="flex justify-center gap-1">
                                    <TooltipProvider>
                                         <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={() => handleDifalStatusChange([row.original], 'beneficio-fiscal')}><ShieldCheck className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Marcar como Benefício Fiscal</p></TooltipContent></Tooltip>
                                         <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-gray-500" onClick={() => handleDifalStatusChange([row.original], 'disregard')}><EyeOff className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Desconsiderar</p></TooltipContent></Tooltip>
                                    </TooltipProvider>
                                </div>
                            )}]} data={difalAnalysisData.difalItems} />
                        </TabsContent>
                        <TabsContent value="beneficio-fiscal" className="mt-4">
                             <DataTable columns={columns} data={difalAnalysisData.beneficioFiscalItems} />
                        </TabsContent>
                        <TabsContent value="desconsiderados" className="mt-4">
                            <DataTable columns={[...columns, { id: 'difal-actions', header: 'Ações DIFAL', cell: ({row}) => (
                                <div className="flex justify-center gap-1">
                                    <TooltipProvider>
                                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600" onClick={() => handleDifalStatusChange([row.original], 'difal')}><TicketX className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Reverter e Marcar como DIFAL</p></TooltipContent></Tooltip>
                                    </TooltipProvider>
                                </div>
                            )}]} data={difalAnalysisData.desconsideradosItems} />
                        </TabsContent>
                    </Tabs>
                </TabsContent>
            </Tabs>
        </div>
    );
}
