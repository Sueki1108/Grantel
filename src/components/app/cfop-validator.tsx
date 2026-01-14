
"use client";

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/components/app/columns-helper";
import { useToast } from '@/hooks/use-toast';
import type { AllClassifications, SupplierCategory, Classification, DifalStatus } from '@/lib/types';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cfopDescriptions } from '@/lib/cfop';
import { getCstDescription } from '@/lib/cst';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Label } from '../ui/label';
import { ScrollArea } from '../ui/scroll-area';
import { Checkbox } from '../ui/checkbox';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
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
            const currentGlobalFilters = tabFilters ? tabFilters[siengeCfop] : null;
            
            // Se não houver filtros salvos para este CFOP, começa com tudo selecionado
            setLocalFilters({
                xmlCsts: currentGlobalFilters?.xmlCsts ? new Set(currentGlobalFilters.xmlCsts) : new Set(availableOptions.xmlCsts),
                xmlPicms: currentGlobalFilters?.xmlPicms ? new Set(currentGlobalFilters.xmlPicms) : new Set(availableOptions.xmlPicms),
                xmlCfops: currentGlobalFilters?.xmlCfops ? new Set(currentGlobalFilters.xmlCfops) : new Set(availableOptions.xmlCfops),
                contabilizacao: currentGlobalFilters?.contabilizacao ? new Set(currentGlobalFilters.contabilizacao) : new Set(availableOptions.contabilizacao),
                centroCusto: currentGlobalFilters?.centroCusto ? new Set(currentGlobalFilters.centroCusto) : new Set(availableOptions.centroCusto),
            });
        }
    }, [isDialogOpen, tabFilters, siengeCfop, availableOptions]);
    
    const filters = (tabFilters && tabFilters[siengeCfop]) || { xmlCsts: new Set(), xmlPicms: new Set(), xmlCfops: new Set(), contabilizacao: new Set(), centroCusto: new Set() };
    const isFilterActive = filters && (
                           (filters.xmlCsts?.size ?? availableOptions.xmlCsts.length) < availableOptions.xmlCsts.length ||
                           (filters.xmlPicms?.size ?? availableOptions.xmlPicms.length) < availableOptions.xmlPicms.length ||
                           (filters.xmlCfops?.size ?? availableOptions.xmlCfops.length) < availableOptions.xmlCfops.length ||
                           (filters.contabilizacao?.size ?? availableOptions.contabilizacao.length) < availableOptions.contabilizacao.length ||
                           (filters.centroCusto?.size ?? availableOptions.centroCusto.length) < availableOptions.centroCusto.length
    );


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
        const isAllCsts = localFilters.xmlCsts.size === availableOptions.xmlCsts.length;
        const isAllPicms = localFilters.xmlPicms.size === availableOptions.xmlPicms.length;
        const isAllCfops = localFilters.xmlCfops.size === availableOptions.xmlCfops.length;
        const isAllContabilizacao = localFilters.contabilizacao.size === availableOptions.contabilizacao.length;
        const isAllCentroCusto = localFilters.centroCusto.size === availableOptions.centroCusto.length;

        if (isAllCsts && isAllPicms && isAllCfops && isAllContabilizacao && isAllCentroCusto) {
            setTabFilters(prev => {
                const newFilters = { ...prev };
                delete newFilters[siengeCfop];
                return newFilters;
            });
        } else {
            setTabFilters(prev => {
                const newFilters: Record<string, TabFilters> = { ...prev };
                newFilters[siengeCfop] = {
                    xmlCsts: new Set(localFilters.xmlCsts),
                    xmlPicms: new Set(localFilters.xmlPicms),
                    xmlCfops: new Set(localFilters.xmlCfops),
                    contabilizacao: new Set(localFilters.contabilizacao),
                    centroCusto: new Set(localFilters.centroCusto),
                };
                return newFilters;
            });
        }
        setIsDialogOpen(false);
    };

    return (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
                <Button variant={isFilterActive ? "secondary" : "outline"} size="sm" className="ml-4">
                    <LucideIcons.ListFilter className="mr-2 h-4 w-4" /> Filtros
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
    const [activeTab, setActiveTab] = useState<ValidationStatus | 'faturamento-entrega' | 'difal-analysis' | 'contabilizacao-error' | 'categorized-suppliers' | 'contabilizacao-check'>('unvalidated');
    const [activeCfopTabs, setActiveCfopTabs] = useState<Record<string, string>>({});
    const [tabFilters, setTabFilters] = useState<Record<string, TabFilters>>({});
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({
        'Fornecedor': true,
        'Número da Nota': true,
        'Descrição': true,
        'Centro de Custo': true,
        'Contabilização': true,
        'CFOP': true,
        'CFOP (Sienge)': true,
        'Valor Total': true,
        'Ações': true,
        'Sienge_Esp': true,
        'NCM': true,
        'CEST': true,
        'Alíq. ICMS (%)': true,
        'CST do ICMS': true,
    });

    // Salvar visibilidade das colunas
    useEffect(() => {
        localStorage.setItem('grantel_cfop_columns', JSON.stringify(columnVisibility));
    }, [columnVisibility]);

    useEffect(() => {
        const toSave: Record<string, any> = {};
        Object.keys(tabFilters).forEach(cfop => {
            if (tabFilters[cfop]) {
                toSave[cfop] = {
                    xmlCsts: tabFilters[cfop].xmlCsts ? Array.from(tabFilters[cfop].xmlCsts) : null,
                    xmlPicms: tabFilters[cfop].xmlPicms ? Array.from(tabFilters[cfop].xmlPicms) : null,
                    xmlCfops: tabFilters[cfop].xmlCfops ? Array.from(tabFilters[cfop].xmlCfops) : null,
                    contabilizacao: tabFilters[cfop].contabilizacao ? Array.from(tabFilters[cfop].contabilizacao) : null,
                    centroCusto: tabFilters[cfop].centroCusto ? Array.from(tabFilters[cfop].centroCusto) : null,
                };
            }
        });
        localStorage.setItem('grantel_cfop_filters', JSON.stringify(toSave));
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
        const cfopValidations = (competence && allPersistedData?.[competence]?.cfopValidations?.classifications) || {};
        
        const statusResult: Record<ValidationStatus, Record<string, any[]>> = {
            all: {}, unvalidated: {}, correct: {}, incorrect: {}, verify: {}
        };
        
        if (Array.isArray(enrichedItems)) {
            enrichedItems.forEach(item => {
                if (!item) return;
                const cnpj = (item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '');
                const productCode = String(item['Código'] || '').trim();
                const siengeCfopValue = String(item['Sienge_CFOP'] || item['CFOP (Sienge)'] || '').trim();
                const contabilizacaoValue = String(item['Contabilização'] || '').trim();
                
                const uniqueKey = normalizeKey(`${cnpj}-${productCode}-${siengeCfopValue}-${contabilizacaoValue}`);
                const validation = cfopValidations[uniqueKey];
                const classification = validation?.classification || 'unvalidated';
                const itemWithKey = { ...item };
                const cfopGroupKey = String(item['CFOP (Sienge)'] || item['CFOP'] || 'N/A');

                if (!statusResult.all[cfopGroupKey]) statusResult.all[cfopGroupKey] = [];
                statusResult.all[cfopGroupKey].push(itemWithKey);

                if (statusResult[classification]) {
                    if (!statusResult[classification][cfopGroupKey]) statusResult[classification][cfopGroupKey] = [];
                    statusResult[classification][cfopGroupKey].push(itemWithKey);
                }
            });
        }
        return statusResult;
    }, [enrichedItems, competence, allPersistedData, bulkActionState]);

    const contabilizacaoErroItems = useMemo(() => {
        const errors: Record<string, boolean> = (competence && (allPersistedData?.[competence] as any)?.contabilizacaoErrors) || {};
        if (!Array.isArray(enrichedItems)) return [];
        return enrichedItems.filter(item => {
            const key = item['Chave de acesso'] && item['Item'] ? `${item['Chave de acesso']}-${item['Item']}` : `${item['Chave Unica']}-${item['Item']}`;
            return !!errors[key];
        });
    }, [enrichedItems, competence, allPersistedData]);

    const difalAnalysisData = useMemo(() => {
        const difalValidations = (competence && allPersistedData?.[competence]?.difalValidations?.classifications) || {};
        const correctItems = itemsByStatus.correct ? Object.values(itemsByStatus.correct).flat() : [];
        
        const sujeitosAoDifal = correctItems.filter(item => {
            const cfopXml = String(item['CFOP'] || '').trim();
            const cfopSienge = String(item['Sienge_CFOP'] || item['CFOP (Sienge)'] || '').trim();
            // Verifica tanto o CFOP do XML quanto o CFOP do Sienge (com e sem espaços)
            const isDifalCfop = cfopXml === '2551' || cfopXml === '2556' || 
                               cfopSienge === '2551' || cfopSienge === '2556' ||
                               cfopXml.startsWith('2551') || cfopXml.startsWith('2556') ||
                               cfopSienge.startsWith('2551') || cfopSienge.startsWith('2556');
            return isDifalCfop;
        }).map(item => {
            const itemKey = item['Chave de acesso'] && item['Item'] ? `${item['Chave de acesso']}-${item['Item']}` : `${item['Chave Unica']}-${item['Item']}`;
            return {...item, __itemKey: itemKey};
        });

        const difalItems: typeof sujeitosAoDifal = [];
        const desconsideradosItems: typeof sujeitosAoDifal = [];
        const beneficioFiscalItems: typeof sujeitosAoDifal = [];
        
        sujeitosAoDifal.forEach(item => {
            const itemKey = item.__itemKey;
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
             const itemKey = item.__itemKey;
             return !difalValidations[itemKey];
        });

        return { sujeitosAoDifal: finalSujeitos, difalItems, desconsideradosItems, beneficioFiscalItems };

    }, [itemsByStatus.correct, allPersistedData, competence]);

    const categorizedSupplierItems = useMemo(() => {
        const supplierClassifications = (competence && allPersistedData?.[competence]?.supplierClassifications) || {};
        if (!Array.isArray(enrichedItems)) return [];
        return enrichedItems.filter(item => {
            const supplierCnpj = item['CPF/CNPJ do Emitente'];
            return !!supplierClassifications[supplierCnpj];
        });
    }, [enrichedItems, allPersistedData, competence]);

    const itemsBySupplier = useMemo(() => {
        const groups: Record<string, any[]> = {};
        if (Array.isArray(enrichedItems)) {
            enrichedItems.forEach(item => {
                const supplier = item['Fornecedor'] || 'N/A';
                if (!groups[supplier]) groups[supplier] = [];
                groups[supplier].push(item);
            });
        }
        return groups;
    }, [enrichedItems]);

    const itemsByContabilizacao = useMemo(() => {
        const groups: Record<string, any[]> = {};
        if (Array.isArray(enrichedItems)) {
            enrichedItems.forEach(item => {
                const rawContab = String(item['Contabilização'] || 'N/A').trim();
                const normalizedContab = rawContab
                    .split(/[\/,]/)
                    .map(part => part.trim())
                    .filter(Boolean)
                    .sort((a, b) => a.localeCompare(b))
                    .join(' / ');
                
                const groupKey = normalizedContab || 'N/A';
                if (!groups[groupKey]) groups[groupKey] = [];
                groups[groupKey].push(item);
            });
        }
        return groups;
    }, [enrichedItems]);

    const [selectedSupplier, setSelectedSupplier] = useState<string>('');
    const [selectedContabilizacao, setSelectedContabilizacao] = useState<string>('');

    // Efeito para resetar seleções ao mudar de aba principal
    useEffect(() => {
        setRowSelection({});
        setBulkActionState({ classification: null });
        
        // Inicializar seletores se vazios
        if (activeTab === 'categorized-suppliers' && !selectedSupplier) {
            const suppliers = Object.keys(itemsBySupplier).sort();
            if (suppliers.length > 0) setSelectedSupplier(suppliers[0]);
        }
        if (activeTab === 'contabilizacao-check' && !selectedContabilizacao) {
            const contabs = Object.keys(itemsByContabilizacao).sort();
            if (contabs.length > 0) setSelectedContabilizacao(contabs[0]);
        }
    }, [activeTab, itemsBySupplier, itemsByContabilizacao]);

    useEffect(() => {
        if (!initialItems) {
            setEnrichedItems([]);
            return;
        }

        const newItems = initialItems.map(item => {
            if (!item) return null;
            const header = (nfeValidasData || []).find(n => n && n['Chave Unica'] === item['Chave Unica']);
            const cnpj = (item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '');
            const productCode = String(item['Código'] || '').trim();
            const siengeCfopValue = String(item['Sienge_CFOP'] || item['CFOP (Sienge)'] || '').trim();
            const contabilizacaoValue = String(item['Contabilização'] || '').trim();
            
            const uniqueKey = normalizeKey(`${cnpj}-${productCode}-${siengeCfopValue}-${contabilizacaoValue}`);
            return {
                ...item,
                '__itemKey': `cfop-pending-${uniqueKey}`,
                Fornecedor: header?.Fornecedor || item.Fornecedor || 'N/A',
            };
        }).filter(Boolean);
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
        if (!competence) {
            toast({ variant: 'destructive', title: "Erro", description: "Competência não definida." });
            return;
        }

        const updatedPersistedData = JSON.parse(JSON.stringify(allPersistedData));
        if (!updatedPersistedData[competence]) {
            updatedPersistedData[competence] = { 
                classifications: {}, 
                accountCodes: {}, 
                cfopValidations: { classifications: {} }
            };
        }
        if (!updatedPersistedData[competence].cfopValidations) {
            updatedPersistedData[competence].cfopValidations = { classifications: {} };
        }
        if (!updatedPersistedData[competence].cfopValidations.classifications) {
            updatedPersistedData[competence].cfopValidations.classifications = {};
        }
        
        const classifications = updatedPersistedData[competence].cfopValidations.classifications;
        let changedCount = 0;

        itemsToUpdate.forEach(item => {
            const cnpj = (item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '');
            const productCode = String(item['Código'] || '').trim();
            const siengeCfopValue = String(item['Sienge_CFOP'] || item['CFOP (Sienge)'] || '').trim();
            const contabilizacaoValue = String(item['Contabilização'] || '').trim();
            
            const uniqueKey = normalizeKey(`${cnpj}-${productCode}-${siengeCfopValue}-${contabilizacaoValue}`);
            
            if (newClassification === 'unvalidated') {
                if (classifications[uniqueKey]) {
                    delete classifications[uniqueKey];
                    changedCount++;
                }
            } else {
                const current = classifications[uniqueKey] || { isDifal: false };
                if (current.classification !== newClassification) {
                    classifications[uniqueKey] = { ...current, classification: newClassification };
                    changedCount++;
                }
            }
        });
        
        if (changedCount > 0) {
            onPersistData(updatedPersistedData);
            toast({
                title: "Sucesso",
                description: `${changedCount} item(ns) atualizado(s) para ${
                    newClassification === 'correct' ? 'Correto' : 
                    newClassification === 'incorrect' ? 'Incorreto' : 
                    newClassification === 'verify' ? 'A Verificar' : 'Não Validado'
                }.`
            });
        }
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
            const itemKey = item['Chave de acesso'] && item['Item'] ? `${item['Chave de acesso']}-${item['Item']}` : `${item['Chave Unica']}-${item['Item']}`;
            updatedPersistedData[competence].difalValidations!.classifications[itemKey] = { status };
        });

        onPersistData(updatedPersistedData);
    };

    const handleToggleContabilizacaoError = (item: any, marked: boolean) => {
        if (!competence) return;
        const updatedData = JSON.parse(JSON.stringify(allPersistedData));
        if (!updatedData[competence]) updatedData[competence] = { classifications: {}, accountCodes: {}, cfopValidations: { classifications: {} }, difalValidations: { classifications: {}}, supplierClassifications: {}, contabilizacaoErrors: {} } as any;
        if (!updatedData[competence].contabilizacaoErrors) updatedData[competence].contabilizacaoErrors = {} as any;
        
        // Marcar todos os itens da mesma nota
        const noteNumber = item['Número da Nota'];
        const cnpj = (item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '');
        
        if (noteNumber && cnpj) {
            enrichedItems.forEach(enrichedItem => {
                const itemNoteNumber = enrichedItem['Número da Nota'];
                const itemCnpj = (enrichedItem['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '');
                
                if (itemNoteNumber === noteNumber && itemCnpj === cnpj) {
                    const itemKey = enrichedItem['Chave de acesso'] && enrichedItem['Item'] ? `${enrichedItem['Chave de acesso']}-${enrichedItem['Item']}` : `${enrichedItem['Chave Unica']}-${enrichedItem['Item']}`;
                    updatedData[competence].contabilizacaoErrors[itemKey] = marked;
                }
            });
        } else {
            const errorKey = item['Chave de acesso'] && item['Item'] ? `${item['Chave de acesso']}-${item['Item']}` : `${item['Chave Unica']}-${item['Item']}`;
            updatedData[competence].contabilizacaoErrors[errorKey] = marked;
        }
        
        onPersistData(updatedData);
    };

    const handleCorrigido = (item: any) => {
        handleToggleContabilizacaoError(item, false);
        toast({ title: 'Erro de contabilização corrigido' });
    };
    
    const handleBulkAction = (forcedClassification?: ValidationStatus) => {
        let itemsToProcess: any[] = [];
        
        const effectiveClassification = forcedClassification || bulkActionState.classification;
        
        if (activeTab === 'contabilizacao-error') {
            itemsToProcess = contabilizacaoErroItems;
        } else if (activeTab === 'categorized-suppliers') {
            itemsToProcess = itemsBySupplier[selectedSupplier] || [];
        } else if (activeTab === 'contabilizacao-check') {
            itemsToProcess = itemsByContabilizacao[selectedContabilizacao] || [];
        } else if (activeTab === 'difal-analysis') {
            itemsToProcess = difalAnalysisData.sujeitosAoDifal;
        } else {
            const activeStatus = activeTab as ValidationStatus;
            const cfopGroupsForStatus = itemsByStatus[activeStatus] || {};
            const allCfopsForStatus = Object.keys(cfopGroupsForStatus).sort((a, b) => {
                const na = parseInt(a, 10);
                const nb = parseInt(b, 10);
                if (Number.isNaN(na) || Number.isNaN(nb)) return a.localeCompare(b);
                return na - nb;
            });

            let cfop = activeCfopTabs[activeStatus];
            if (!cfop && allCfopsForStatus.length > 0) {
                cfop = allCfopsForStatus[0];
            }

            if (!cfop) return;
            
            const allItemsInCfop = itemsByStatus[activeStatus][cfop] || [];
            const currentFilters = tabFilters[cfop];
            
            itemsToProcess = allItemsInCfop.filter(item => {
                if (!currentFilters) return true;
                const cfopCode = item['CFOP'];
                const cstCode = String(item['CST do ICMS'] || '');
                const picmsValue = (item['Alíq. ICMS (%)'] !== undefined && item['Alíq. ICMS (%)'] !== null) ? String(item['Alíq. ICMS (%)']) : 'N/A';
                const contabilizacao = item['Contabilização'] || 'N/A';
                const centroCusto = item['Centro de Custo'] || 'N/A';
                const cfopFull = cfopCode ? `${cfopCode}: ${cfopDescriptions[parseInt(cfopCode, 10) as keyof typeof cfopDescriptions] || "N/A"}` : '';
                const cstFull = cstCode ? `${cstCode}: ${getCstDescription(cstCode)}` : '';
                const cfopMatch = !currentFilters.xmlCfops || currentFilters.xmlCfops.has(cfopFull);
                const cstMatch = !currentFilters.xmlCsts || currentFilters.xmlCsts.has(cstFull);
                const picmsMatch = !currentFilters.xmlPicms || currentFilters.xmlPicms.has(picmsValue);
                const contabilizacaoMatch = !currentFilters.contabilizacao || currentFilters.contabilizacao.has(String(contabilizacao));
                const centroCustoMatch = !currentFilters.centroCusto || currentFilters.centroCusto.has(String(centroCusto));
                return cfopMatch && cstMatch && picmsMatch && contabilizacaoMatch && centroCustoMatch;
            });
        }

        const selectedItems = Object.keys(rowSelection).map(index => {
            return itemsToProcess[parseInt(index)];
        }).filter(Boolean);

        if (selectedItems.length === 0) return;
        
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
            const siengeCfopValue = String(item['Sienge_CFOP'] || item['CFOP (Sienge)'] || '').trim();
            const contabilizacaoValue = String(item['Contabilização'] || '').trim();
            
            const uniqueKey = normalizeKey(`${cnpj}-${productCode}-${siengeCfopValue}-${contabilizacaoValue}`);
            
            if (effectiveClassification === 'unvalidated') {
                if (newValidations[uniqueKey]) {
                    delete newValidations[uniqueKey];
                    changedCount++;
                }
            } else if (effectiveClassification) {
                const current = newValidations[uniqueKey] || { isDifal: false };
                if (current.classification !== effectiveClassification) {
                    newValidations[uniqueKey] = { ...current, classification: effectiveClassification };
                    changedCount++;
                }
            }
        });

        if (changedCount > 0 || (effectiveClassification && effectiveClassification !== 'all' && effectiveClassification !== 'unvalidated')) {
            onPersistData(updatedPersistedData);
        }
        
        setBulkActionState({ classification: null });
        setRowSelection({});
        toast({
            title: "Ações em Massa Aplicadas",
            description: `${changedCount} itens foram atualizados.`
        });
    };

    const handleExport = (data: any[], title: string, format: 'excel' | 'pdf') => {
        if (!data || data.length === 0) {
            toast({ title: 'Nenhum dado para exportar', variant: 'destructive' });
            return;
        }

        // 1. Filtrar apenas as colunas que estão visíveis na interface
        const visibleColumns = Object.keys(columnVisibility).filter(key => columnVisibility[key] && key !== 'Ações' && key !== 'actions' && key !== 'difal-actions');
        
        // 2. Preparar os dados para exportação (apenas colunas visíveis e formatadas)
        const exportData = data.map(item => {
            const row: Record<string, any> = {};
            visibleColumns.forEach(col => {
                let value = item[col];
                // Formatação especial para valores monetários e porcentagens
                if (col === 'Valor Total' && typeof value === 'number') {
                    value = value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                } else if (col === 'Alíq. ICMS (%)' && typeof value === 'number') {
                    value = `${value.toFixed(2)}%`;
                }
                row[col] = value ?? 'N/A';
            });
            return row;
        });

        if (format === 'excel') {
            const worksheet = XLSX.utils.json_to_sheet(exportData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, title.substring(0, 31));
            XLSX.writeFile(workbook, `Grantel_${title.replace(/\s+/g, '_')}.xlsx`);
        } else {
            const doc = new jsPDF('l', 'mm', 'a4');
            const headers = [visibleColumns];
            const body = exportData.map(row => visibleColumns.map(col => String(row[col])));

            (doc as any).autoTable({
                head: headers,
                body: body,
                startY: 20,
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [41, 128, 185], textColor: 255 },
                margin: { top: 20 },
                didDrawPage: (data: any) => {
                    doc.text(`Grantel - ${title}`, 14, 15);
                }
            });
            doc.save(`Grantel_${title.replace(/\s+/g, '_')}.pdf`);
        }

        toast({ title: `Exportação ${format.toUpperCase()} concluída!` });
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
         updatedData.supplierCategories = { [competence as string]: categories };
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
                '__itemKey': `entrega-futura-${index}`
            }));
            
            const simplesFaturamento = enrichedItems.filter((item: any) => {
                const cfop = String(item['CFOP'] || '').trim();
                return SIMPLES_FATURAMENTO_CFOPS.includes(cfop);
            }).map((item, index) => ({
                ...item, 
                '__itemKey': `simples-faturamento-${index}`
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


    const handleResetClassifications = () => {
        if (!competence) return;
        
        const updatedPersistedData = JSON.parse(JSON.stringify(allPersistedData));
        if (updatedPersistedData[competence]) {
            // Limpa as validações de CFOP
            if (updatedPersistedData[competence].cfopValidations) {
                updatedPersistedData[competence].cfopValidations.classifications = {};
            }
            // Limpa os erros de contabilização
            if (updatedPersistedData[competence].contabilizacaoErrors) {
                updatedPersistedData[competence].contabilizacaoErrors = {};
            }
            
            onPersistData(updatedPersistedData);
            toast({
                title: "Classificações Reiniciadas",
                description: "Todas as validações de CFOP e erros de contabilização foram limpos para esta competência."
            });
        }
    };

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
        
        const cfopValidations = (competence && allPersistedData?.[competence]?.cfopValidations?.classifications) || {};
        const supplierCategories = allPersistedData?.supplierCategories || [];
        const supplierClassifications = (competence && allPersistedData?.[competence]?.supplierClassifications) || {};
        const contabilizacaoErrors = (competence && (allPersistedData?.[competence] as any)?.contabilizacaoErrors) || {};
        
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
                            <LucideIcons.Copy className="h-3 w-3" />
                        </Button>
                    </div>
                );
                
                if (id === 'Fornecedor') {
                    const supplierCnpj = item['CPF/CNPJ do Emitente'];
                    const supplierClassificationId = supplierClassifications[supplierCnpj];
                    const supplierCategoriesArray = Array.isArray(supplierCategories) ? supplierCategories : (competence && (supplierCategories as any)?.[competence]) ? (supplierCategories as any)[competence] : [];
                    const category = Array.isArray(supplierCategoriesArray) ? supplierCategoriesArray.find((c: SupplierCategory) => c.id === supplierClassificationId) : undefined;
                    
                    const LucideIcon = (category && (category as any).icon && LucideIcons[(category as any).icon as keyof typeof LucideIcons])
                        ? (LucideIcons[(category as any).icon as keyof typeof LucideIcons] as React.ElementType)
                        : LucideIcons.Tag;
                    const isAllowedCfop = !category || !(category as any).allowedCfops || !Array.isArray((category as any).allowedCfops) || (category as any).allowedCfops.length === 0 || (category as any).allowedCfops.includes(String(item['CFOP']));

                    return (
                         <div className="flex items-center gap-2 group/row">
                           <Popover>
                                <PopoverTrigger asChild>
                                    <button onClick={(e) => e.stopPropagation()} className="transition-opacity">
                                        <Tooltip><TooltipTrigger asChild>
                                            <LucideIcon className={cn("h-4 w-4", !isAllowedCfop && "text-red-500", category && isAllowedCfop ? "text-primary" : "text-muted-foreground")} />
                                        </TooltipTrigger><TooltipContent><p>{(category as unknown as SupplierCategory)?.name || "Sem categoria"}</p></TooltipContent></Tooltip>
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-2" onClick={(e) => e.stopPropagation()}>
                                     <div className="space-y-1">
                                        {Array.isArray(supplierCategoriesArray) && supplierCategoriesArray.length > 0 ? (
                                            supplierCategoriesArray.map((cat: SupplierCategory) => {
                                                const CatIcon = (cat.icon && LucideIcons[cat.icon as keyof typeof LucideIcons])
                                                    ? (LucideIcons[cat.icon as keyof typeof LucideIcons] as React.ElementType)
                                                    : LucideIcons.Tag;
                                                return (
                                                    <Button 
                                                        key={cat.id} 
                                                        variant={supplierClassificationId === cat.id ? "default" : "ghost"} 
                                                        size="sm" 
                                                        className="w-full justify-start gap-2" 
                                                        onClick={() => handleSupplierCategoryChange(supplierCnpj, cat.id)}
                                                    >
                                                        <CatIcon className="h-4 w-4" />
                                                        <span className="truncate">{cat.name}</span>
                                                    </Button>
                                                );
                                            })
                                        ) : (
                                            <div className="text-xs text-center p-2 text-muted-foreground italic">Nenhuma categoria criada</div>
                                        )}
                                        <hr className="my-1"/>
                                        <Button variant="ghost" size="sm" className="w-full justify-start text-red-500 hover:text-red-500 hover:bg-red-50" onClick={() => handleSupplierCategoryChange(supplierCnpj, null)}>
                                            <LucideIcons.Trash2 className="mr-2 h-4 w-4" /> Remover Classificação
                                        </Button>
                                    </div>
                                </PopoverContent>
                            </Popover>
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
                        <Tooltip><TooltipTrigger asChild><span>{summarizedDesc}</span></TooltipTrigger><TooltipContent><p>{value}</p></TooltipContent></Tooltip>,
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
                    const itemKey = item['Chave de acesso'] && item['Item'] ? `${item['Chave de acesso']}-${item['Item']}` : `${item['Chave Unica']}-${item['Item']}`;
                    const isMarked = !!contabilizacaoErrors[itemKey];
                    return (
                        <div className="flex items-center gap-2">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleToggleContabilizacaoError(item, !isMarked); }}>
                                        <LucideIcons.AlertTriangle className={cn("h-4 w-4", isMarked ? "text-destructive" : "text-muted-foreground")} />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>{isMarked ? "Erro de contabilização (marcar toda nota)" : "Marcar erro de contabilização (toda nota)"}</p></TooltipContent>
                            </Tooltip>
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
                                            <LucideIcons.Check className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>Correto</p></TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild><Button size="icon" variant={classification === 'incorrect' ? 'destructive' : 'ghost'} className={cn("h-7 w-7", classification === 'incorrect' ? 'bg-red-600 text-white hover:bg-red-700' : 'text-red-600 hover:bg-red-100 dark:hover:bg-red-900/50')} onClick={() => handleValidationChange([row.original], 'incorrect')}><LucideIcons.X className="h-4 w-4" /></Button></TooltipTrigger>
                                    <TooltipContent><p>Incorreto</p></TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild><Button size="icon" variant={classification === 'verify' ? 'default' : 'ghost'} className={cn("h-7 w-7", classification === 'verify' ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/50')} onClick={() => handleValidationChange([row.original], 'verify')}><LucideIcons.HelpCircle className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>A Verificar</p></TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleValidationChange([row.original], 'unvalidated')}><LucideIcons.RotateCw className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Limpar Validação</p></TooltipContent>
                                </Tooltip>
                            {activeTab === 'contabilizacao-error' && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                                            handleCorrigido(row.original);
                                        }}>
                                            <LucideIcons.CheckCircle className="h-4 w-4 text-emerald-600" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>Corrigido (marcar toda nota)</p></TooltipContent>
                                </Tooltip>
                            )}
                        </div>
                    );
                }
            },
        ]);
    }, [enrichedItems, allPersistedData, competence, toast, activeTab]);
    
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
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRowSelection({})}><LucideIcons.X className="h-4 w-4"/></Button>
                        <div className="h-6 border-l" />
                        
                        <div className="flex gap-1">
                            <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => handleBulkAction('correct')}><LucideIcons.Check className="mr-2 h-4 w-4" /> Correto</Button>
                            <Button size="sm" className="bg-red-600 text-white hover:bg-red-700" onClick={() => handleBulkAction('incorrect')}><LucideIcons.X className="mr-2 h-4 w-4" /> Incorreto</Button>
                            <Button size="sm" className="bg-amber-500 text-white hover:bg-amber-600" onClick={() => handleBulkAction('verify')}><LucideIcons.HelpCircle className="mr-2 h-4 w-4" /> Verificar</Button>
                            <Button size="sm" variant="outline" onClick={() => handleBulkAction('unvalidated')}><LucideIcons.RotateCw className="mr-2 h-4 w-4" /> Reverter</Button>
                        </div>
                    </Card>
                </div>
            )}
            
            <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as ValidationStatus | 'faturamento-entrega' | 'difal-analysis' | 'contabilizacao-error' | 'categorized-suppliers' | 'contabilizacao-check')} className="w-full">
                 <div className="flex justify-between items-center mb-2">
                    <TabsList className="grid w-full grid-cols-10">
                        {statusTabs.map(({status, label}) => {
                            const count = Object.values(itemsByStatus[status] || {}).flat().length;
                            return <TabsTrigger key={status} value={status} disabled={count === 0}>{label} ({count})</TabsTrigger>
                        })}
                        <TabsTrigger value="contabilizacao-error" className="flex gap-2"><LucideIcons.AlertTriangle className="h-4 w-4" />Erros ({contabilizacaoErroItems.length})</TabsTrigger>
                        <TabsTrigger value="faturamento-entrega">Faturamento</TabsTrigger>
                        <TabsTrigger value="difal-analysis">DIFAL</TabsTrigger>
                        <TabsTrigger value="categorized-suppliers" className="flex gap-2"><LucideIcons.Tag className="h-4 w-4" /> Fornecedores ({categorizedSupplierItems.length})</TabsTrigger>
                        <TabsTrigger value="contabilizacao-check" className="flex gap-2"><LucideIcons.BookOpen className="h-4 w-4" /> Contabilização</TabsTrigger>
                    </TabsList>
                    <div className="flex gap-2 ml-4">
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50">
                                    <LucideIcons.RotateCcw className="mr-2 h-4 w-4" /> Reiniciar Tudo
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Reiniciar Classificações?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Esta ação irá limpar **todas** as validações de CFOP e erros de contabilização marcados para a competência {competence}. 
                                        Todos os itens voltarão para a aba "Não Validado". Esta ação não pode ser desfeita.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleResetClassifications} className="bg-red-600 hover:bg-red-700">
                                        Confirmar Reinicialização
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>

                        <Button onClick={handleEnrichData} variant="outline" size="sm"><LucideIcons.RefreshCw className="mr-2 h-4 w-4" />Carregar ICMS/CEST do XML</Button>
                         <SupplierCategoryDialog 
                            categories={Array.isArray(allPersistedData.supplierCategories) ? allPersistedData.supplierCategories : (competence && allPersistedData.supplierCategories?.[competence]) || []}
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
                                        <div className="flex gap-2">
                                            <Button onClick={() => handleExport(Object.values(cfopGroupsForStatus).flat(), `Aba_${status}`, 'excel')} size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50">
                                                <LucideIcons.Download className="mr-2 h-4 w-4" /> Excel ({Object.values(cfopGroupsForStatus).flat().length})
                                            </Button>
                                            <Button onClick={() => handleExport(Object.values(cfopGroupsForStatus).flat(), `Aba_${status}`, 'pdf')} size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50">
                                                <LucideIcons.Download className="mr-2 h-4 w-4" /> PDF
                                            </Button>
                                        </div>
                                    </div>
                                    {allCfopsForStatus.map(cfop => {
                                        const allItemsForCfop = cfopGroupsForStatus[cfop] || [];
                                        const currentFilters = tabFilters ? tabFilters[cfop] : null;
                                        
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

                                            // Só filtra se houver uma seleção ativa (tamanho do set < total disponível)
                                            const cfopMatch = !currentFilters.xmlCfops || currentFilters.xmlCfops.has(cfopFull);
                                            const cstMatch = !currentFilters.xmlCsts || currentFilters.xmlCsts.has(cstFull);
                                            const picmsMatch = !currentFilters.xmlPicms || currentFilters.xmlPicms.has(picmsValue);
                                            const contabilizacaoMatch = !currentFilters.contabilizacao || currentFilters.contabilizacao.has(String(contabilizacao));
                                            const centroCustoMatch = !currentFilters.centroCusto || currentFilters.centroCusto.has(String(centroCusto));

                                            return cfopMatch && cstMatch && picmsMatch && contabilizacaoMatch && centroCustoMatch;
                                        });

                                        return (
                                            <TabsContent key={`${status}-${cfop}`} value={cfop} className="mt-4">
                                                <div className='flex justify-between items-center mb-2'>
                                                    <div className='text-lg font-bold'>
                                                        {cfopDescriptions[parseInt(cfop, 10) as keyof typeof cfopDescriptions] || "Descrição não encontrada"}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex gap-1 border rounded-md p-1 bg-muted/30">
                                                            <Button onClick={() => handleExport(currentCfopData, `CFOP_${cfop}_${status}`, 'excel')} size="sm" variant="ghost" className="h-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
                                                                <LucideIcons.Download className="mr-1 h-3 w-3" /> Excel
                                                            </Button>
                                                            <Button onClick={() => handleExport(currentCfopData, `CFOP_${cfop}_${status}`, 'pdf')} size="sm" variant="ghost" className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50">
                                                                <LucideIcons.Download className="mr-1 h-3 w-3" /> PDF
                                                            </Button>
                                                        </div>
                                                        <FilterDialog siengeCfop={cfop} items={allItemsForCfop} tabFilters={tabFilters} setTabFilters={setTabFilters} />
                                                    </div>
                                                </div>
                                                <DataTable 
                                                    columns={columns} 
                                                    data={currentCfopData} 
                                                    rowSelection={rowSelection} 
                                                    setRowSelection={setRowSelection} 
                                                    autoResetPageIndex={false}
                                                    getRowClassName={(item: any) => {
                                                        if (!item) return "";
                                                        const supplierCnpj = item['CPF/CNPJ do Emitente'];
                                                        const supplierClassificationId = (competence && allPersistedData?.[competence]?.supplierClassifications?.[supplierCnpj]);
                                                        
                                                        let supplierCategoriesArray: SupplierCategory[] = [];
                                                        const rawCategories = allPersistedData?.supplierCategories;
                                                        if (Array.isArray(rawCategories)) {
                                                            supplierCategoriesArray = rawCategories;
                                                        } else if (rawCategories && competence && Array.isArray((rawCategories as any)[competence])) {
                                                            supplierCategoriesArray = (rawCategories as any)[competence];
                                                        }

                                                        const category = supplierCategoriesArray.find((c: SupplierCategory) => c.id === supplierClassificationId);
                                                        const isAllowedCfop = !category || !Array.isArray(category.allowedCfops) || category.allowedCfops.length === 0 || category.allowedCfops.includes(String(item['CFOP']));
                                                        return !isAllowedCfop ? "bg-red-50 hover:bg-red-100 text-red-900" : "";
                                                    }}
                                                />
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
                    <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                            <div className="text-lg font-bold">Erros de Contabilização</div>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <LucideIcons.Info className="h-4 w-4 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Itens que possuem inconsistência entre o CFOP e a Contabilização/Centro de Custo</p>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        <div className="flex gap-1 border rounded-md p-1 bg-muted/30">
                            <Button onClick={() => handleExport(contabilizacaoErroItems, 'Erros_Contabilizacao', 'excel')} size="sm" variant="ghost" className="h-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
                                <LucideIcons.Download className="mr-1 h-3 w-3" /> Excel
                            </Button>
                            <Button onClick={() => handleExport(contabilizacaoErroItems, 'Erros_Contabilizacao', 'pdf')} size="sm" variant="ghost" className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50">
                                <LucideIcons.Download className="mr-1 h-3 w-3" /> PDF
                            </Button>
                        </div>
                    </div>
                    <DataTable columns={columns} data={contabilizacaoErroItems} rowSelection={rowSelection} setRowSelection={setRowSelection} autoResetPageIndex={false} />
                </TabsContent>
                <TabsContent value="faturamento-entrega" className="mt-4">
                     <div className="flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-lg mb-6">
                        <p className="text-muted-foreground mb-4">Clique no botão para analisar as notas de Entrega Futura e Simples Faturamento dos itens de entrada (CFOPs do fornecedor).</p>
                        <Button onClick={handleLoadSpecialCfops} disabled={isLoadingSpecialCfops}>
                            {isLoadingSpecialCfops ? <><LucideIcons.Cpu className="mr-2 h-4 w-4 animate-spin" />Analisando...</> : <><LucideIcons.Cpu className="mr-2 h-4 w-4" />Analisar Faturamento/Entrega</>}
                        </Button>
                    </div>

                    <Tabs defaultValue="entrega-futura">
                        <TabsList className="grid w-full grid-cols-2">
                             <TabsTrigger value="entrega-futura">Entrega Futura ({itemsEntregaFutura.length})</TabsTrigger>
                             <TabsTrigger value="simples-faturamento">Simples Faturamento ({itemsSimplesFaturamento.length})</TabsTrigger>
                        </TabsList>
                        <TabsContent value="entrega-futura" className="mt-4">
                            <div className="flex justify-between items-center mb-2">
                                <div className="text-lg font-bold">Entrega Futura</div>
                                <div className="flex gap-1 border rounded-md p-1 bg-muted/30">
                                    <Button onClick={() => handleExport(itemsEntregaFutura, 'Entrega_Futura', 'excel')} size="sm" variant="ghost" className="h-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
                                        <LucideIcons.Download className="mr-1 h-3 w-3" /> Excel
                                    </Button>
                                    <Button onClick={() => handleExport(itemsEntregaFutura, 'Entrega_Futura', 'pdf')} size="sm" variant="ghost" className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50">
                                        <LucideIcons.Download className="mr-1 h-3 w-3" /> PDF
                                    </Button>
                                </div>
                            </div>
                            <DataTable columns={columns} data={itemsEntregaFutura} rowSelection={rowSelection} setRowSelection={setRowSelection} autoResetPageIndex={false} />
                        </TabsContent>
                        <TabsContent value="simples-faturamento" className="mt-4">
                            <div className="flex justify-between items-center mb-2">
                                <div className="text-lg font-bold">Simples Faturamento</div>
                                <div className="flex gap-1 border rounded-md p-1 bg-muted/30">
                                    <Button onClick={() => handleExport(itemsSimplesFaturamento, 'Simples_Faturamento', 'excel')} size="sm" variant="ghost" className="h-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
                                        <LucideIcons.Download className="mr-1 h-3 w-3" /> Excel
                                    </Button>
                                    <Button onClick={() => handleExport(itemsSimplesFaturamento, 'Simples_Faturamento', 'pdf')} size="sm" variant="ghost" className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50">
                                        <LucideIcons.Download className="mr-1 h-3 w-3" /> PDF
                                    </Button>
                                </div>
                            </div>
                            <DataTable columns={columns} data={itemsSimplesFaturamento} rowSelection={rowSelection} setRowSelection={setRowSelection} autoResetPageIndex={false} />
                        </TabsContent>
                    </Tabs>
                </TabsContent>
                <TabsContent value="categorized-suppliers" className="mt-4">
                    {Object.keys(itemsBySupplier).length > 0 ? (
                        <div className="space-y-4">
                            <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-lg border">
                                <div className="flex-1 max-w-md">
                                    <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">Selecionar Fornecedor</Label>
                                    <select 
                                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                                        value={selectedSupplier}
                                        onChange={(e) => {
                                            setSelectedSupplier(e.target.value);
                                            setRowSelection({});
                                        }}
                                    >
                                        {Object.keys(itemsBySupplier).sort().map(supplier => (
                                            <option key={supplier} value={supplier}>
                                                {supplier} ({itemsBySupplier[supplier].length} itens)
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex flex-col justify-end h-full">
                                    <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block invisible">Exportar</Label>
                                    <div className="flex gap-1 border rounded-md p-1 bg-background">
                                        <Button 
                                            onClick={() => handleExport(itemsBySupplier[selectedSupplier] || [], `Fornecedor_${selectedSupplier.replace(/\s+/g, '_')}`, 'excel')} 
                                            size="sm" variant="ghost" className="h-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                            disabled={!selectedSupplier}
                                        >
                                            <LucideIcons.Download className="mr-1 h-3 w-3" /> Excel
                                        </Button>
                                        <Button 
                                            onClick={() => handleExport(itemsBySupplier[selectedSupplier] || [], `Fornecedor_${selectedSupplier.replace(/\s+/g, '_')}`, 'pdf')} 
                                            size="sm" variant="ghost" className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                                            disabled={!selectedSupplier}
                                        >
                                            <LucideIcons.Download className="mr-1 h-3 w-3" /> PDF
                                        </Button>
                                    </div>
                                </div>
                            </div>
                            
                            {selectedSupplier && (
                                <div className="animate-in fade-in-0 slide-in-from-top-2 duration-300">
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="text-lg font-bold">Fornecedor: {selectedSupplier}</div>
                                    </div>
                                    <DataTable columns={columns} data={itemsBySupplier[selectedSupplier] || []} rowSelection={rowSelection} setRowSelection={setRowSelection} autoResetPageIndex={false} />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center text-muted-foreground p-8">Nenhum fornecedor categorizado encontrado.</div>
                    )}
                </TabsContent>
                <TabsContent value="contabilizacao-check" className="mt-4">
                    {Object.keys(itemsByContabilizacao).length > 0 ? (
                        <div className="space-y-4">
                            <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-lg border">
                                <div className="flex-1 max-w-md">
                                    <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">Selecionar Contabilização</Label>
                                    <select 
                                        className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                                        value={selectedContabilizacao}
                                        onChange={(e) => {
                                            setSelectedContabilizacao(e.target.value);
                                            setRowSelection({});
                                        }}
                                    >
                                        {Object.keys(itemsByContabilizacao).sort().map(contab => (
                                            <option key={contab} value={contab}>
                                                {contab} ({itemsByContabilizacao[contab].length} itens)
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex flex-col justify-end h-full">
                                    <Label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block invisible">Exportar</Label>
                                    <div className="flex gap-1 border rounded-md p-1 bg-background">
                                        <Button 
                                            onClick={() => handleExport(itemsByContabilizacao[selectedContabilizacao] || [], `Contab_${selectedContabilizacao.replace(/\s+/g, '_')}`, 'excel')} 
                                            size="sm" variant="ghost" className="h-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                            disabled={!selectedContabilizacao}
                                        >
                                            <LucideIcons.Download className="mr-1 h-3 w-3" /> Excel
                                        </Button>
                                        <Button 
                                            onClick={() => handleExport(itemsByContabilizacao[selectedContabilizacao] || [], `Contab_${selectedContabilizacao.replace(/\s+/g, '_')}`, 'pdf')} 
                                            size="sm" variant="ghost" className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                                            disabled={!selectedContabilizacao}
                                        >
                                            <LucideIcons.Download className="mr-1 h-3 w-3" /> PDF
                                        </Button>
                                    </div>
                                </div>
                            </div>
                            
                            {selectedContabilizacao && (
                                <div className="animate-in fade-in-0 slide-in-from-top-2 duration-300">
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="text-lg font-bold">Contabilização: {selectedContabilizacao}</div>
                                    </div>
                                    <DataTable columns={columns} data={itemsByContabilizacao[selectedContabilizacao] || []} rowSelection={rowSelection} setRowSelection={setRowSelection} autoResetPageIndex={false} />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center text-muted-foreground p-8">Nenhum dado de contabilização disponível.</div>
                    )}
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
                            <div className="mb-4 flex justify-between items-center">
                                <div className="text-lg font-bold">Sujeitos ao DIFAL</div>
                                <div className="flex gap-2">
                                    <div className="flex gap-1 border rounded-md p-1 bg-muted/30">
                                        <Button onClick={() => handleExport(difalAnalysisData.sujeitosAoDifal, 'Sujeitos_DIFAL', 'excel')} size="sm" variant="ghost" className="h-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
                                            <LucideIcons.Download className="mr-1 h-3 w-3" /> Excel
                                        </Button>
                                        <Button onClick={() => handleExport(difalAnalysisData.sujeitosAoDifal, 'Sujeitos_DIFAL', 'pdf')} size="sm" variant="ghost" className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50">
                                            <LucideIcons.Download className="mr-1 h-3 w-3" /> PDF
                                        </Button>
                                    </div>
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        onClick={() => {
                                            toast({ title: "Lista atualizada", description: `${difalAnalysisData.sujeitosAoDifal.length} itens sujeitos a DIFAL encontrados.` });
                                        }}
                                    >
                                        <LucideIcons.RefreshCw className="mr-2 h-4 w-4" /> Atualizar Lista
                                    </Button>
                                </div>
                            </div>
                            <DataTable columns={[...columns, { id: 'difal-actions', header: 'Ações DIFAL', cell: ({row}) => (
                                <div className="flex justify-center gap-1">
                                    <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600" onClick={() => handleDifalStatusChange([row.original], 'difal')}><LucideIcons.Ticket className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Marcar como DIFAL</p></TooltipContent></Tooltip>
                                    <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={() => handleDifalStatusChange([row.original], 'beneficio-fiscal')}><LucideIcons.ShieldCheck className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Marcar como Benefício Fiscal</p></TooltipContent></Tooltip>
                                    <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-gray-500" onClick={() => handleDifalStatusChange([row.original], 'disregard')}><LucideIcons.EyeOff className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Desconsiderar</p></TooltipContent></Tooltip>
                                </div>
                            )}]} data={difalAnalysisData.sujeitosAoDifal} autoResetPageIndex={false} />
                        </TabsContent>
                         <TabsContent value="difal" className="mt-4">
                            <div className="flex justify-between items-center mb-2">
                                <div className="text-lg font-bold">Itens DIFAL</div>
                                <div className="flex gap-1 border rounded-md p-1 bg-muted/30">
                                    <Button onClick={() => handleExport(difalAnalysisData.difalItems, 'Itens_DIFAL', 'excel')} size="sm" variant="ghost" className="h-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
                                        <LucideIcons.Download className="mr-1 h-3 w-3" /> Excel
                                    </Button>
                                    <Button onClick={() => handleExport(difalAnalysisData.difalItems, 'Itens_DIFAL', 'pdf')} size="sm" variant="ghost" className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50">
                                        <LucideIcons.Download className="mr-1 h-3 w-3" /> PDF
                                    </Button>
                                </div>
                            </div>
                            <DataTable columns={[...columns, { id: 'difal-actions', header: 'Ações DIFAL', cell: ({row}) => (
                                <div className="flex justify-center gap-1">
                                     <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={() => handleDifalStatusChange([row.original], 'beneficio-fiscal')}><LucideIcons.ShieldCheck className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Marcar como Benefício Fiscal</p></TooltipContent></Tooltip>
                                     <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-gray-500" onClick={() => handleDifalStatusChange([row.original], 'disregard')}><LucideIcons.EyeOff className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent><p>Desconsiderar</p></TooltipContent></Tooltip>
                                </div>
                            )}]} data={difalAnalysisData.difalItems} autoResetPageIndex={false} />
                        </TabsContent>
                        <TabsContent value="beneficio-fiscal" className="mt-4">
                            <div className="flex justify-between items-center mb-2">
                                <div className="text-lg font-bold">Benefício Fiscal</div>
                                <div className="flex gap-1 border rounded-md p-1 bg-muted/30">
                                    <Button onClick={() => handleExport(difalAnalysisData.beneficioFiscalItems, 'Beneficio_Fiscal', 'excel')} size="sm" variant="ghost" className="h-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
                                        <LucideIcons.Download className="mr-1 h-3 w-3" /> Excel
                                    </Button>
                                    <Button onClick={() => handleExport(difalAnalysisData.beneficioFiscalItems, 'Beneficio_Fiscal', 'pdf')} size="sm" variant="ghost" className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50">
                                        <LucideIcons.Download className="mr-1 h-3 w-3" /> PDF
                                    </Button>
                                </div>
                            </div>
                            <DataTable columns={columns} data={difalAnalysisData.beneficioFiscalItems} autoResetPageIndex={false} />
                        </TabsContent>
                        <TabsContent value="desconsiderados" className="mt-4">
                            <div className="flex justify-between items-center mb-2">
                                <div className="text-lg font-bold">Desconsiderados</div>
                                <div className="flex gap-1 border rounded-md p-1 bg-muted/30">
                                    <Button onClick={() => handleExport(difalAnalysisData.desconsideradosItems, 'Desconsiderados', 'excel')} size="sm" variant="ghost" className="h-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
                                        <LucideIcons.Download className="mr-1 h-3 w-3" /> Excel
                                    </Button>
                                    <Button onClick={() => handleExport(difalAnalysisData.desconsideradosItems, 'Desconsiderados', 'pdf')} size="sm" variant="ghost" className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50">
                                        <LucideIcons.Download className="mr-1 h-3 w-3" /> PDF
                                    </Button>
                                </div>
                            </div>
                            <DataTable columns={[...columns, { id: 'difal-actions', header: 'Ações DIFAL', cell: ({row}) => (
                                <div className="flex justify-center gap-1">
                                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600" onClick={() => handleDifalStatusChange([row.original], 'difal')}><LucideIcons.TicketX className="h-4 w-4" /> Reverter para DIFAL</Button></TooltipTrigger><TooltipContent><p>Reverter e Marcar como DIFAL</p></TooltipContent></Tooltip>
                                </div>
                            )}]} data={difalAnalysisData.desconsideradosItems} autoResetPageIndex={false} />
                        </TabsContent>
                    </Tabs>
                </TabsContent>
            </Tabs>
        </div>
    );
}
