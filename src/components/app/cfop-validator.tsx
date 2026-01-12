
"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/components/app/columns-helper";
import { Check, X, HelpCircle, RotateCw, ListFilter, Copy, Download, Factory, Wrench, HardHat, Settings, Ticket, Tag, RefreshCw, ChevronDown, ChevronRight, MinusCircle, Cpu, EyeOff, ShieldCheck, TicketX, AlertTriangle, CheckCircle } from "lucide-react";
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
    contabilizacao: Set<string>;
    centroCusto: Set<string>;
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
    const [localFilters, setLocalFilters] = React.useState<TabFilters>({ xmlCsts: new Set(), xmlPicms: new Set(), xmlCfops: new Set(), contabilizacao: new Set(), centroCusto: new Set() });

    const availableOptions = useMemo(() => {
        const xmlCsts = new Set<string>();
        const xmlPicms = new Set<string>();
        const xmlCfops = new Set<string>();
        const contabilizacoes = new Set<string>();
        const centrosCusto = new Set<string>();
        items.forEach(item => {
            const cstCode = String(item['CST do ICMS'] || '');
            if(cstCode) {
                const cstDesc = getCstDescription(cstCode);
                xmlCsts.add(`${cstCode}: ${cstDesc}`);
            }

            if (item['Alíq. ICMS (%)'] !== undefined && item['Alíq. ICMS (%)'] !== null) {
                xmlPicms.add(String(item['Alíq. ICMS (%)']));
            } else {
                xmlPicms.add('N/A');
            }
            
            const cfopCode = item['CFOP']; 
            if (cfopCode) {
                const fullDescription = cfopDescriptions[parseInt(cfopCode, 10) as keyof typeof cfopDescriptions] || "N/A";
                const combined = `${cfopCode}: ${fullDescription}`;
                xmlCfops.add(combined);
            }

            const contabilizacao = item['Contabilização'] || 'N/A';
            contabilizacoes.add(String(contabilizacao));

            const centroCusto = item['Centro de Custo'] || 'N/A';
            centrosCusto.add(String(centroCusto));
        });
        return {
            xmlCsts: Array.from(xmlCsts).sort(),
            xmlPicms: Array.from(xmlPicms).sort((a,b) => parseFloat(a) - parseFloat(b)),
            xmlCfops: Array.from(xmlCfops).sort(),
            contabilizacao: Array.from(contabilizacoes).sort(),
            centroCusto: Array.from(centrosCusto).sort(),
        };
    }, [items]);
    
     useEffect(() => {
        if (isDialogOpen) {
            const currentGlobalFilters = tabFilters[siengeCfop];
            
            if (!currentGlobalFilters) {
                // Se não houver filtros, tudo começa selecionado
                setLocalFilters({
                    xmlCsts: new Set(availableOptions.xmlCsts),
                    xmlPicms: new Set(availableOptions.xmlPicms),
                    xmlCfops: new Set(availableOptions.xmlCfops),
                    contabilizacao: new Set(availableOptions.contabilizacao),
                    centroCusto: new Set(availableOptions.centroCusto),
                });
            } else {
                // Se houver filtros, carregamos exatamente o que está salvo globalmente
                setLocalFilters({
                    xmlCsts: new Set(currentGlobalFilters.xmlCsts),
                    xmlPicms: new Set(currentGlobalFilters.xmlPicms),
                    xmlCfops: new Set(currentGlobalFilters.xmlCfops),
                    contabilizacao: new Set(currentGlobalFilters.contabilizacao),
                    centroCusto: new Set(currentGlobalFilters.centroCusto),
                });
            }
        }
    }, [isDialogOpen, tabFilters, siengeCfop, availableOptions]);
    
    const filters = tabFilters[siengeCfop] || { xmlCsts: new Set(), xmlPicms: new Set(), xmlCfops: new Set(), contabilizacao: new Set(), centroCusto: new Set() };
    const isFilterActive = filters.xmlCsts?.size < availableOptions.xmlCsts.length ||
                           filters.xmlPicms?.size < availableOptions.xmlPicms.length ||
                           filters.xmlCfops?.size < availableOptions.xmlCfops.length ||
                           filters.contabilizacao?.size < availableOptions.contabilizacao.length ||
                           filters.centroCusto?.size < availableOptions.centroCusto.length;


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

    const handleGlobalSelectAll = (type: 'all' | 'none') => {
        const newFilters: TabFilters = {
            xmlCsts: new Set(),
            xmlPicms: new Set(),
            xmlCfops: new Set(),
            contabilizacao: new Set(),
            centroCusto: new Set()
        };

        if (type === 'all') {
            newFilters.xmlCsts = new Set(availableOptions.xmlCsts);
            newFilters.xmlPicms = new Set(availableOptions.xmlPicms);
            newFilters.xmlCfops = new Set(availableOptions.xmlCfops);
            newFilters.contabilizacao = new Set(availableOptions.contabilizacao);
            newFilters.centroCusto = new Set(availableOptions.centroCusto);
        }

        setLocalFilters(newFilters);
    };
    
    const handleApplyFilters = () => {
        // Verifica se todos os itens estão selecionados em todas as categorias
        const isAllCsts = localFilters.xmlCsts.size === availableOptions.xmlCsts.length;
        const isAllPicms = localFilters.xmlPicms.size === availableOptions.xmlPicms.length;
        const isAllCfops = localFilters.xmlCfops.size === availableOptions.xmlCfops.length;
        const isAllContabilizacao = localFilters.contabilizacao.size === availableOptions.contabilizacao.length;
        const isAllCentroCusto = localFilters.centroCusto.size === availableOptions.centroCusto.length;

        // Se tudo estiver selecionado, limpamos o filtro para esse CFOP (mostrar tudo)
        if (isAllCsts && isAllPicms && isAllCfops && isAllContabilizacao && isAllCentroCusto) {
            setTabFilters(prev => {
                const newFilters = { ...prev };
                delete newFilters[siengeCfop];
                return newFilters;
            });
        } else {
            setTabFilters(prev => ({
                ...prev,
                [siengeCfop]: {
                    xmlCsts: new Set(localFilters.xmlCsts),
                    xmlPicms: new Set(localFilters.xmlPicms),
                    xmlCfops: new Set(localFilters.xmlCfops),
                    contabilizacao: new Set(localFilters.contabilizacao),
                    centroCusto: new Set(localFilters.centroCusto),
                },
            }));
        }
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
                 <DialogHeader className="flex flex-row items-center justify-between">
                    <div>
                        <DialogTitle>Filtros Avançados para CFOP {siengeCfop}</DialogTitle>
                        <DialogDescription>Desmarque os itens que deseja ocultar da visualização.</DialogDescription>
                    </div>
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => {
                            const allSelected = 
                                localFilters.xmlCsts.size === availableOptions.xmlCsts.length &&
                                localFilters.xmlPicms.size === availableOptions.xmlPicms.length &&
                                localFilters.xmlCfops.size === availableOptions.xmlCfops.length &&
                                localFilters.contabilizacao.size === availableOptions.contabilizacao.length &&
                                localFilters.centroCusto.size === availableOptions.centroCusto.length;
                            
                            handleGlobalSelectAll(allSelected ? 'none' : 'all');
                        }}
                        title="Marcar/Desmarcar Todos"
                    >
                        <LucideIcons.CheckSquare className="h-5 w-5" />
                    </Button>
                </DialogHeader>
                 <Tabs defaultValue='cfop' className='w-full'>
                    <TabsList className='grid grid-cols-5 w-full'>
                        <TabsTrigger value='cfop'>CFOP (XML)</TabsTrigger>
                        <TabsTrigger value='cst'>CST ICMS (XML)</TabsTrigger>
                        <TabsTrigger value='picms'>Alíquota ICMS (XML)</TabsTrigger>
                        <TabsTrigger value='contabilizacao'>Contabilização</TabsTrigger>
                        <TabsTrigger value='centroCusto'>Centro de Custo</TabsTrigger>
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
                                        <Label htmlFor={`picms-${opt}`} className="text-sm font-normal">{opt === 'N/A' ? 'N/A' : `${parseFloat(opt).toFixed(2)}%`}</Label>
                                    </div>
                                ))}
                            </ScrollArea>
                        </TabsContent>
                        <TabsContent value='contabilizacao'>
                            <div className="flex justify-end gap-2 mb-2">
                                <Button variant="ghost" size="sm" onClick={() => handleSelectAllForTab('contabilizacao', 'all')}>Marcar Todos</Button>
                                <Button variant="ghost" size="sm" onClick={() => handleSelectAllForTab('contabilizacao', 'none')}>Desmarcar Todos</Button>
                            </div>
                            <ScrollArea className='h-96 border rounded-md p-4'>
                                {availableOptions.contabilizacao.map(opt => (
                                    <div key={`contabilizacao-${opt}`} className="flex items-start space-x-2 mb-2">
                                        <Checkbox id={`contabilizacao-${opt}`} checked={localFilters?.contabilizacao.has(opt)} onCheckedChange={checked => handleFilterChange('contabilizacao', opt, !!checked)} />
                                        <Label htmlFor={`contabilizacao-${opt}`} className="text-sm font-normal cursor-pointer">{opt}</Label>
                                    </div>
                                ))}
                            </ScrollArea>
                        </TabsContent>
                        <TabsContent value='centroCusto'>
                            <div className="flex justify-end gap-2 mb-2">
                                <Button variant="ghost" size="sm" onClick={() => handleSelectAllForTab('centroCusto', 'all')}>Marcar Todos</Button>
                                <Button variant="ghost" size="sm" onClick={() => handleSelectAllForTab('centroCusto', 'none')}>Desmarcar Todos</Button>
                            </div>
                            <ScrollArea className='h-96 border rounded-md p-4'>
                                {availableOptions.centroCusto.map(opt => (
                                    <div key={`centroCusto-${opt}`} className="flex items-start space-x-2 mb-2">
                                        <Checkbox id={`centroCusto-${opt}`} checked={localFilters?.centroCusto.has(opt)} onCheckedChange={checked => handleFilterChange('centroCusto', opt, !!checked)} />
                                        <Label htmlFor={`centroCusto-${opt}`} className="text-sm font-normal cursor-pointer">{opt}</Label>
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
    const [activeTab, setActiveTab] = useState<ValidationStatus | 'faturamento-entrega' | 'difal-analysis' | 'contabilizacao-error'>('unvalidated');
    const [activeCfopTabs, setActiveCfopTabs] = useState<Record<string, string>>({});
    const [tabFilters, setTabFilters] = useState<Record<string, TabFilters>>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('grantel_cfop_filters');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    // Converter arrays de volta para Sets
                    const restored: Record<string, TabFilters> = {};
                    Object.keys(parsed).forEach(cfop => {
                        restored[cfop] = {
                            xmlCsts: new Set(parsed[cfop].xmlCsts),
                            xmlPicms: new Set(parsed[cfop].xmlPicms),
                            xmlCfops: new Set(parsed[cfop].xmlCfops),
                            contabilizacao: new Set(parsed[cfop].contabilizacao),
                            centroCusto: new Set(parsed[cfop].centroCusto),
                        };
                    });
                    return restored;
                } catch (e) {
                    console.error('Erro ao carregar filtros salvos:', e);
                }
            }
        }
        return {};
    });
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({
        'Centro de Custo': true,
        'Contabilização': true,
        'Sienge_Esp': true,
        'CFOP (Sienge)': true,
        'NCM': true,
        'CEST': true,
        'Alíq. ICMS (%)': true,
        'CST do ICMS': true,
    }); => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('grantel_cfop_columns');
            if (saved) {
                try {
                    return JSON.parse(saved);
                } catch (e) {
                    console.error('Erro ao carregar colunas salvas:', e);
                }
            }
        }
        // Colunas padrão visíveis
        return {
            'Fornecedor': true,
            'Número da Nota': true,
            'Descrição': true,
            'Centro de Custo': true,
            'Contabilização': true,
            'CFOP': true,
            'CFOP (Sienge)': true,
            'Valor Total': true,
            'Ações': true
        };
    });

    // Salvar visibilidade das colunas
    useEffect(() => {
        localStorage.setItem('grantel_cfop_columns', JSON.stringify(columnVisibility));
    }, [columnVisibility]);

    // Efeito para salvar filtros sempre que mudarem de forma profunda
    useEffect(() => {
        if (Object.keys(tabFilters).length > 0) {
            const toSave: Record<string, any> = {};
            Object.keys(tabFilters).forEach(cfop => {
                if (tabFilters[cfop]) {
                    toSave[cfop] = {
                        xmlCsts: Array.from(tabFilters[cfop].xmlCsts || []),
                        xmlPicms: Array.from(tabFilters[cfop].xmlPicms || []),
                        xmlCfops: Array.from(tabFilters[cfop].xmlCfops || []),
                        contabilizacao: Array.from(tabFilters[cfop].contabilizacao || []),
                        centroCusto: Array.from(tabFilters[cfop].centroCusto || []),
                    };
                }
            });
            localStorage.setItem('grantel_cfop_filters', JSON.stringify(toSave));
        }
    }, [tabFilters]);

    const handleApplyFilters = (cfop: string, filters: TabFilters) => {
        setTabFilters(prev => {
            const newFilters = {
                ...prev,
                [cfop]: {
                    xmlCsts: new Set(filters.xmlCsts),
                    xmlPicms: new Set(filters.xmlPicms),
                    xmlCfops: new Set(filters.xmlCfops),
                    contabilizacao: new Set(filters.contabilizacao),
                    centroCusto: new Set(filters.centroCusto),
                }
            };
            return newFilters;
        });
        toast({ title: "Filtros aplicados e salvos!" });
    };
    const [bulkActionState, setBulkActionState] = useState<BulkActionState>({ classification: null });
    const [itemsEntregaFutura, setItemsEntregaFutura] = useState<any[]>([]);
    const [itemsSimplesFaturamento, setItemsSimplesFaturamento] = useState<any[]>([]);
    const [isLoadingSpecialCfops, setIsLoadingSpecialCfops] = useState(false);

    const itemsByStatus = useMemo(() => {
        const cfopValidations = (competence && allPersistedData[competence]?.cfopValidations?.classifications) || {};
        
        const statusResult: Record<ValidationStatus, Record<string, any[]>> = {
            all: {}, unvalidated: {}, correct: {}, incorrect: {}, verify: {}
        };
        
        enrichedItems.forEach(item => {
            const cnpj = (item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '');
            const productCode = String(item['Código'] || '').trim();
            const siengeCfop = String(item['Sienge_CFOP'] || '').trim();
            const contabilizacao = String(item['Contabilização'] || '').trim();
            
            const uniqueKey = normalizeKey(`${cnpj}-${productCode}-${siengeCfop}-${contabilizacao}`);
            const validation = cfopValidations[uniqueKey];
            const classification = validation?.classification || 'unvalidated';
            const itemWithKey = { ...item };
            const siengeCfop = String(item['CFOP (Sienge)']) || 'N/A';

            if (!statusResult.all[siengeCfop]) statusResult.all[siengeCfop] = [];
            statusResult.all[siengeCfop].push(itemWithKey);

            if (!statusResult[classification][siengeCfop]) statusResult[classification][siengeCfop] = [];
            statusResult[classification][siengeCfop].push(itemWithKey);
        });
        return statusResult;
    }, [enrichedItems, competence, allPersistedData]);

    const contabilizacaoErroItems = useMemo(() => {
        const errors = (competence && allPersistedData[competence]?.contabilizacaoErrors) || {};
        return enrichedItems.filter(item => {
            const key = item['Chave de acesso'] && item['Item'] ? `${item['Chave de acesso']}-${item['Item']}` : `${item['Chave Unica']}-${item['Item']}`;
            return !!errors[key];
        });
    }, [enrichedItems, competence, allPersistedData]);

    const difalAnalysisData = useMemo(() => {
        const difalValidations = (competence && allPersistedData[competence]?.difalValidations?.classifications) || {};
        const correctItems = Object.values(itemsByStatus.correct).flat();
        
        const sujeitosAoDifal = correctItems.filter(item => {
            const cfopXml = String(item['CFOP'] || '').trim();
            const cfopSienge = String(item['Sienge_CFOP'] || item['CFOP (Sienge)'] || '').trim();
            // Verifica tanto o CFOP do XML quanto o CFOP do Sienge (com e sem espaços)
            const isDifalCfop = cfopXml === '2551' || cfopXml === '2556' || 
                               cfopSienge === '2551' || cfopSienge === '2556' ||
                               cfopXml.startsWith('2551') || cfopXml.startsWith('2556') ||
                               cfopSienge.startsWith('2551') || cfopSienge.startsWith('2556');
            return isDifalCfop;
        }).map(item => ({...item, __itemKey: `${item['Chave de acesso']}-${item['Item']}`}));

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

    useEffect(() => {
        setRowSelection({});
        setBulkActionState({ classification: null });
    }, [activeTab]);

    useEffect(() => {
        const status = activeTab as ValidationStatus;
        const groups = itemsByStatus[status] || {};
        const cfops = Object.keys(groups);
        if (cfops.length > 0) {
            const current = activeCfopTabs[status];
            if (!current || !groups[current]) {
                setActiveCfopTabs(prev => ({ ...prev, [status]: cfops[0] }));
                setRowSelection({});
                setBulkActionState({ classification: null });
            }
        }
    }, [activeTab, itemsByStatus]);

    useEffect(() => {
        setRowSelection({});
        setBulkActionState({ classification: null });
    }, [activeTab]);

    useEffect(() => {
        if (!initialItems) {
            setEnrichedItems([]);
            return;
        }

        const newItems = initialItems.map(item => {
            const header = (nfeValidasData || []).find(n => n['Chave Unica'] === item['Chave Unica']);
            const cnpj = (item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '');
            const productCode = String(item['Código'] || '').trim();
            const siengeCfop = String(item['Sienge_CFOP'] || '').trim();
            const contabilizacao = String(item['Contabilização'] || '').trim();
            
            const uniqueKey = normalizeKey(`${cnpj}-${productCode}-${siengeCfop}-${contabilizacao}`);
            return {
                ...item,
                '__itemKey': `cfop-pending-${uniqueKey}`,
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
        
        // Recarregar as abas especiais se já estiverem abertas
        if (itemsEntregaFutura.length > 0 || itemsSimplesFaturamento.length > 0) {
            handleLoadSpecialCfops();
        }
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
            const cnpj = (item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '');
            const productCode = String(item['Código'] || '').trim();
            const siengeCfop = String(item['Sienge_CFOP'] || item['CFOP (Sienge)'] || '').trim();
            const contabilizacao = String(item['Contabilização'] || '').trim();
            
            const uniqueKey = normalizeKey(`${cnpj}-${productCode}-${siengeCfop}-${contabilizacao}`);
            
            if (newClassification === 'unvalidated') {
                // Se estiver revertendo, removemos a classificação para que ele volte ao estado original
                if (updatedPersistedData[competence].cfopValidations.classifications[uniqueKey]) {
                    delete updatedPersistedData[competence].cfopValidations.classifications[uniqueKey];
                }
            } else {
                const current = updatedPersistedData[competence].cfopValidations.classifications[uniqueKey] || { isDifal: false };
                updatedPersistedData[competence].cfopValidations.classifications[uniqueKey] = { ...current, classification: newClassification };
            }
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

    const handleToggleContabilizacaoError = (key: string, marked: boolean) => {
        if (!competence) return;
        const updatedData = JSON.parse(JSON.stringify(allPersistedData));
        if (!updatedData[competence]) updatedData[competence] = { classifications: {}, accountCodes: {}, cfopValidations: { classifications: {} }, difalValidations: { classifications: {}}, supplierClassifications: {}, contabilizacaoErrors: {} } as any;
        if (!updatedData[competence].contabilizacaoErrors) updatedData[competence].contabilizacaoErrors = {} as any;
        updatedData[competence].contabilizacaoErrors[key] = marked;
        onPersistData(updatedData);
    };

    const handleCorrigido = (key: string) => {
        handleToggleContabilizacaoError(key, false);
        toast({ title: 'Erro de contabilização corrigido' });
    };
    
    const handleBulkAction = () => {
        const activeTableItems = itemsByStatus[activeTab as ValidationStatus]?.[activeCfopTabs[activeTab]] || [];
        if (!activeTableItems || activeTableItems.length === 0) {
            setBulkActionState({ classification: null });
            setRowSelection({});
            return;
        }
        const selectedItemKeys = Object.keys(rowSelection).map(index => {
            const item = activeTableItems[parseInt(index)];
            return item && item.__itemKey;
        }).filter(Boolean) as string[];

        if (selectedItemKeys.length === 0) return;
        
        const selectedItems = selectedItemKeys.map(itemKey => {
            return enrichedItems.find(item => item.__itemKey === itemKey);
        }).filter(Boolean);

        let changedCount = 0;
        
        if (!competence) return;
        const updatedPersistedData = JSON.parse(JSON.stringify(allPersistedData));
        if (!updatedPersistedData[competence]) updatedPersistedData[competence] = { classifications: {}, accountCodes: {}, cfopValidations: { classifications: {} }};
        if (!updatedPersistedData[competence].cfopValidations) updatedPersistedData[competence].cfopValidations = { classifications: {} };
        const newValidations = updatedPersistedData[competence].cfopValidations.classifications;

        selectedItems.forEach(item => {
            if (!item) return;
            const cnpj = (item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '');
            const productCode = String(item['Código'] || '').trim();
            const siengeCfop = String(item['Sienge_CFOP'] || item['CFOP (Sienge)'] || '').trim();
            const contabilizacao = String(item['Contabilização'] || '').trim();
            
            const uniqueKey = normalizeKey(`${cnpj}-${productCode}-${siengeCfop}-${contabilizacao}`);
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
        
            if (!enrichedItems || enrichedItems.length === 0) {
                 toast({ variant: 'destructive', title: 'Fonte de Dados Vazia', description: 'Não há itens processados para analisar.' });
                 setIsLoadingSpecialCfops(false);
                 return;
            }

            // Usamos enrichedItems que já possuem os dados cruzados com o Sienge
            const entregaFutura = enrichedItems.filter((item: any) => {
                const cfop = String(item['CFOP'] || '').trim();
                return ENTREGA_FUTURA_CFOPS.includes(cfop);
            }).map((item, index) => ({
                ...item, 
                '__itemKey': `entrega-futura-${index}`,
                // Garantir que as colunas Sienge apareçam mesmo se o cabeçalho for ligeiramente diferente
                'Sienge_Esp': item['Sienge_Esp'] || item['Esp'] || 'N/A',
                'CFOP (Sienge)': item['CFOP (Sienge)'] || item['Sienge_CFOP'] || 'N/A',
                'Centro de Custo': item['Centro de Custo'] || 'N/A',
                'Contabilização': item['Contabilização'] || 'N/A'
            }));
            
            const simplesFaturamento = enrichedItems.filter((item: any) => {
                const cfop = String(item['CFOP'] || '').trim();
                return SIMPLES_FATURAMENTO_CFOPS.includes(cfop);
            }).map((item, index) => ({
                ...item, 
                '__itemKey': `simples-faturamento-${index}`,
                'Sienge_Esp': item['Sienge_Esp'] || item['Esp'] || 'N/A',
                'CFOP (Sienge)': item['CFOP (Sienge)'] || item['Sienge_CFOP'] || 'N/A',
                'Centro de Custo': item['Centro de Custo'] || 'N/A',
                'Contabilização': item['Contabilização'] || 'N/A'
            }));

            setItemsEntregaFutura(entregaFutura);
            setItemsSimplesFaturamento(simplesFaturamento);
            setIsLoadingSpecialCfops(false);
            
            if (entregaFutura.length > 0 || simplesFaturamento.length > 0) {
                 toast({ title: 'Análise Concluída', description: 'As notas de faturamento e entrega futura foram carregadas.' });
            } else {
                 toast({ variant: 'destructive', title: 'Nenhum Item Encontrado', description: 'Nenhum item com os CFOPs de saída especificados foi encontrado nos XMLs de entrada.' });
            }
        }, 50);
    }, [enrichedItems, toast]);


    const columns = useMemo(() => {
        if (!enrichedItems || enrichedItems.length === 0) return [];
        
        const allPossibleColumns: (keyof any)[] = [
            'Fornecedor', 
            'Número da Nota', 
            'Descrição', 
            'Centro de Custo', 
            'Contabilização', 
            'NCM', 
            'CEST', 
            'Sienge_Esp', 
            'CFOP', 
            'CFOP (Sienge)', 
            'Alíq. ICMS (%)', 
            'CST do ICMS', 
            'Valor Total'
        ];
        
        // Filtrar colunas baseadas na visibilidade
        const columnsToShow = allPossibleColumns.filter(col => columnVisibility[col as string] !== false);
        
        const cfopValidations = (competence && allPersistedData[competence]?.cfopValidations?.classifications) || {};
        const supplierCategories = allPersistedData.supplierCategories || [];
        const supplierClassifications = (competence && allPersistedData[competence]?.supplierClassifications) || {};
        const contabilizacaoErrors = (competence && allPersistedData[competence]?.contabilizacaoErrors) || {};
        
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

                if (id === 'Contabilização') {
                    const errorKey = item['Chave de acesso'] && item['Item'] ? `${item['Chave de acesso']}-${item['Item']}` : `${item['Chave Unica']}-${item['Item']}`;
                    const isMarked = !!contabilizacaoErrors[errorKey];
                    return (
                        <div className="flex items-center gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8">
                                <Columns className="mr-2 h-4 w-4" />
                                Colunas
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel>Alternar Colunas</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {['Fornecedor', 'Número da Nota', 'Descrição', 'Centro de Custo', 'Contabilização', 'NCM', 'CEST', 'Sienge_Esp', 'CFOP', 'CFOP (Sienge)', 'Alíq. ICMS (%)', 'CST do ICMS', 'Valor Total'].map((column) => (
                                <DropdownMenuCheckboxItem
                                    key={column}
                                    className="capitalize"
                                    checked={columnVisibility[column] !== false}
                                    onCheckedChange={(value) => 
                                        setColumnVisibility(prev => ({ ...prev, [column]: !!value }))
                                    }
                                >
                                    {column}
                                </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <Sheet>        <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleToggleContabilizacaoError(errorKey, !isMarked); }}>
                                            <AlertTriangle className={cn("h-4 w-4", isMarked ? "text-destructive" : "text-muted-foreground")} />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>{isMarked ? "Erro de contabilização" : "Marcar erro de contabilização"}</p></TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            {renderCellWithCopy(String(value ?? 'N/A'), String(value ?? 'N/A'), 'Contabilização')}
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
                    const cnpj = (row.original['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '');
                    const productCode = String(row.original['Código'] || '').trim();
                    const siengeCfop = String(row.original['Sienge_CFOP'] || row.original['CFOP (Sienge)'] || '').trim();
                    const contabilizacao = String(row.original['Contabilização'] || '').trim();
                    
                    const uniqueKey = normalizeKey(`${cnpj}-${productCode}-${siengeCfop}-${contabilizacao}`);
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
                            {activeTab === 'contabilizacao-error' && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                                            const key = row.original['Chave de acesso'] && row.original['Item'] ? `${row.original['Chave de acesso']}-${row.original['Item']}` : `${row.original['Chave Unica']}-${row.original['Item']}`;
                                            handleCorrigido(key);
                                        }}>
                                            <CheckCircle className="h-4 w-4 text-green-600" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>Corrigido</p></TooltipContent>
                                </Tooltip>
                            )}
                        </div>
                    );
                }
            },
        ]);
    }, [enrichedItems, allPersistedData, competence, toast]);
    
    useEffect(() => {
        setRowSelection({});
        setBulkActionState({ classification: null });
    }, [itemsByStatus]);



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
    const allCfopsForStatus = Object.keys(cfopGroupsForStatus).sort((a, b) => {
        const na = parseInt(a, 10);
        const nb = parseInt(b, 10);
        if (Number.isNaN(na) || Number.isNaN(nb)) return a.localeCompare(b);
        return na - nb;
    });

    
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
            
            <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as ValidationStatus | 'faturamento-entrega' | 'difal-analysis' | 'contabilizacao-error')} className="w-full">
                 <div className="flex justify-between items-center mb-2">
                    <TabsList className="grid w-full grid-cols-8">
                        {statusTabs.map(({status, label}) => {
                            const count = Object.values(itemsByStatus[status] || {}).flat().length;
                            return <TabsTrigger key={status} value={status} disabled={count === 0}>{label} ({count})</TabsTrigger>
                        })}
                        <TabsTrigger value="contabilizacao-error" className="flex gap-2"><AlertTriangle />Erros de Contabilização ({contabilizacaoErroItems.length})</TabsTrigger>
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
                    const allCfopsForStatus = Object.keys(cfopGroupsForStatus).sort((a,b) => {
                        const na = parseInt(a, 10);
                        const nb = parseInt(b, 10);
                        if (Number.isNaN(na) || Number.isNaN(nb)) return a.localeCompare(b);
                        return na - nb;
                    });
                    
                    return (
                        <TabsContent key={status} value={status} className="mt-4">
                            {allCfopsForStatus.length > 0 ? (
                                <Tabs 
                                    value={allCfopsForStatus.includes(activeCfopTabs[status] || '') ? (activeCfopTabs[status] as string) : allCfopsForStatus[0]} 
                                    onValueChange={(val) => { setActiveCfopTabs(prev => ({...prev, [status]: val})); setRowSelection({}); setBulkActionState({ classification: null }); }}
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
                                            const picmsValue = (item['Alíq. ICMS (%)'] !== undefined && item['Alíq. ICMS (%)'] !== null) 
                                                ? String(item['Alíq. ICMS (%)']) 
                                                : 'N/A';
                                            const contabilizacao = item['Contabilização'] || 'N/A';
                                            const centroCusto = item['Centro de Custo'] || 'N/A';

                                            const cfopFull = cfopCode ? `${cfopCode}: ${cfopDescriptions[parseInt(cfopCode, 10) as keyof typeof cfopDescriptions] || "N/A"}` : '';
                                            const cstFull = cstCode ? `${cstCode}: ${getCstDescription(cstCode)}` : '';

                                            const cfopMatch = !currentFilters.xmlCfops || currentFilters.xmlCfops.size === 0 || currentFilters.xmlCfops.has(cfopFull);
                                            const cstMatch = !currentFilters.xmlCsts || currentFilters.xmlCsts.size === 0 || currentFilters.xmlCsts.has(cstFull);
                                            const picmsMatch = !currentFilters.xmlPicms || currentFilters.xmlPicms.size === 0 || currentFilters.xmlPicms.has(picmsValue);
                                            const contabilizacaoMatch = !currentFilters.contabilizacao || currentFilters.contabilizacao.size === 0 || currentFilters.contabilizacao.has(String(contabilizacao));
                                            const centroCustoMatch = !currentFilters.centroCusto || currentFilters.centroCusto.size === 0 || currentFilters.centroCusto.has(String(centroCusto));

                                            return cfopMatch && cstMatch && picmsMatch && contabilizacaoMatch && centroCustoMatch;
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
                <TabsContent value="contabilizacao-error" className="mt-4">
                    <DataTable columns={columns} data={contabilizacaoErroItems} rowSelection={rowSelection} setRowSelection={setRowSelection} autoResetPageIndex={false} />
                </TabsContent>
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
                            <div className="mb-4 flex justify-end">
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => {
                                        toast({ title: "Lista atualizada", description: `${difalAnalysisData.sujeitosAoDifal.length} itens sujeitos a DIFAL encontrados.` });
                                    }}
                                >
                                    <RefreshCw className="mr-2 h-4 w-4" /> Atualizar Lista
                                </Button>
                            </div>
                            <DataTable columns={[...columns, { id: 'difal-actions', header: 'Ações DIFAL', cell: ({row}) => (
                                <div className="flex justify-center gap-1">
                                    <TooltipProvider>
                                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600" onClick={() => handleDifalStatusChange([row.original], 'difal')}><Ticket className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Marcar como DIFAL</p></TooltipContent></Tooltip>
                                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={() => handleDifalStatusChange([row.original], 'beneficio-fiscal')}><ShieldCheck className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Marcar como Benefício Fiscal</p></TooltipContent></Tooltip>
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
                                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600" onClick={() => handleDifalStatusChange([row.original], 'difal')}><TicketX className="h-4 w-4" /> Reverter para DIFAL</Button></TooltipTrigger><TooltipContent><p>Reverter e Marcar como DIFAL</p></TooltipContent></Tooltip>
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
