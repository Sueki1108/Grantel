
"use client";

import * as React from "react";
import { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/lib/columns-helper";
import { ThumbsDown, ThumbsUp, RotateCcw, AlertTriangle, CheckCircle, FileWarning, Search, ArrowUpDown, FilterX, Copy, Save, Settings, Dot, HelpCircle, ListFilter, TicketPercent, Building } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Badge } from '../ui/badge';
import type { AllClassifications } from './imobilizado-analysis';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { cfopDescriptions } from '@/lib/cfop';
import { RowSelectionState, Table as ReactTable } from '@tanstack/react-table';
import { Card } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Label } from '../ui/label';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from "@/lib/utils";


// Tipos
export interface CfopValidationData extends Record<string, any> {
    'Chave de acesso': string;
    'Número da Nota': string;
    'CPF/CNPJ do Emitente': string;
    'Código': string; // Código do produto no XML
    'Sienge_CFOP'?: string; // CFOP do Sienge - pode não existir para imobilizado
    'Sienge_Descrição'?: string;
    'Fornecedor': string; // Nome do fornecedor do XML
    'Descrição': string; // Descrição do item no XML
    'CFOP': string; // CFOP do XML
    'CST do ICMS'?: string; // CST do ICMS do XML
    'pICMS'?: number; // Alíquota de ICMS do XML
}

type MainValidationStatus = 'unvalidated' | 'correct' | 'incorrect' | 'verify';
type ValidationStatus = {
    main: MainValidationStatus;
    isDifal: boolean;
}

interface GroupedItems {
  [siengeCfop: string]: {
    items: CfopValidationData[];
    xmlCfops: Set<string>;
    xmlCsts: Set<string>;
    xmlPIcms: Set<string>;
  };
}

const columnNameMap: Record<string, string> = {
    'Fornecedor': 'Fornecedor',
    'Número da Nota': 'Nota',
    'Descrição': 'Descrição XML',
    'Sienge_Descrição': 'Descrição Sienge',
    'CFOP': 'CFOP XML',
    'CST do ICMS': 'CST XML',
    'Sienge_CFOP': 'CFOP Sienge',
    'pICMS': 'Alíq. ICMS (%)'
};

const CFOP_VALIDATION_FILTERS_KEY = 'cfopValidationFilters_v2';


interface CfopValidatorProps {
    reconciledItems: CfopValidationData[] | null;
    imobilizadoItems: any[];
    allPersistedClassifications: AllClassifications;
    onPersistAllClassifications: (allData: AllClassifications) => void;
    competence: string | null;
}

const getFullCfopDescription = (cfopCode: string | number): string => {
    const code = parseInt(String(cfopCode), 10);
    return cfopDescriptions[code as keyof typeof cfopDescriptions] || "Descrição não encontrada";
};

// Universal key based on the nature of the operation (full description of CFOP)
const getUniversalProductKey = (item: CfopValidationData): string => {
    const siengeCfop = item['Sienge_CFOP'] || item['CFOP']; // Fallback para CFOP do XML
    const fullDescription = getFullCfopDescription(siengeCfop).toLowerCase();
    return `${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}-${fullDescription}`;
};

const getItemLineKey = (item: CfopValidationData): string => {
    // Unique key for the table row
    return item['Chave de acesso'] + item.Item;
};


export function CfopValidator({ reconciledItems, imobilizadoItems, allPersistedClassifications, onPersistAllClassifications, competence }: CfopValidatorProps) {
    const { toast } = useToast();
    const [validationStatus, setValidationStatus] = useState<Record<string, ValidationStatus>>({});
    const [hasChanges, setHasChanges] = useState(false);
    const [activeFilter, setActiveFilter] = useState<MainValidationStatus | 'all'>('unvalidated');
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
    const [perTabFilters, setPerTabFilters] = useState<Record<string, { cfops: Set<string>, csts: Set<string>, picms: Set<string> }>>({});
    const [currentEditingGroup, setCurrentEditingGroup] = useState<string | null>(null);
    const [tempIncludedCfops, setTempIncludedCfops] = useState<Set<string>>(new Set());
    const [tempIncludedCsts, setTempIncludedCsts] = useState<Set<string>>(new Set());
    const [tempIncludedPIcms, setTempIncludedPIcms] = useState<Set<string>>(new Set());
    
    // Combina itens conciliados com itens de imobilizado
    const allItemsToValidate = useMemo(() => {
        if (!reconciledItems) return [];
        const items = reconciledItems || [];
        const imobItems = imobilizadoItems || [];
        
        // Prevent duplicates: if an imobilizado item is already in reconciled, don't add it again.
        const reconciledItemKeys = new Set(items.map(item => getItemLineKey(item)));
        const uniqueImobilizadoItems = imobItems.filter(item => !reconciledItemKeys.has(getItemLineKey(item)));

        return [...items, ...uniqueImobilizadoItems];
    }, [reconciledItems, imobilizadoItems]);
    
    useEffect(() => {
        try {
            const savedFiltersRaw = localStorage.getItem(CFOP_VALIDATION_FILTERS_KEY);
            if (savedFiltersRaw) {
                const savedFilters = JSON.parse(savedFiltersRaw);
                const restoredFilters: Record<string, { cfops: Set<string>, csts: Set<string>, picms: Set<string> }> = {};
                for (const key in savedFilters) {
                    restoredFilters[key] = {
                        cfops: new Set(savedFilters[key].cfops || []),
                        csts: new Set(savedFilters[key].csts || []),
                        picms: new Set(savedFilters[key].picms || []),
                    };
                }
                setPerTabFilters(restoredFilters);
            }
        } catch (e) {
            console.error("Failed to load CFOP/CST filters:", e);
        }
    }, []);


    useEffect(() => {
        if (!competence) return;
        const initialStatus: Record<string, ValidationStatus> = {};

        allItemsToValidate.forEach(item => {
            const universalProductKey = getUniversalProductKey(item);
            let finalStatus: ValidationStatus = { main: 'unvalidated', isDifal: false };

            // Look through all past competences for a classification
            for (const otherCompetence in allPersistedClassifications) {
                const historicClassification = allPersistedClassifications[otherCompetence]?.cfopValidations?.classifications?.[universalProductKey];
                if (historicClassification) {
                    finalStatus.main = historicClassification.classification as MainValidationStatus;
                    finalStatus.isDifal = historicClassification.isDifal || false;
                    break;
                }
            }
            
            initialStatus[getItemLineKey(item)] = finalStatus;
        });

        setValidationStatus(initialStatus);
        setHasChanges(false);
    }, [allItemsToValidate, allPersistedClassifications, competence]);


     const handleMainStatusChange = (itemsToUpdate: CfopValidationData[], newMainStatus: MainValidationStatus) => {
        const newValidationStatus = { ...validationStatus };
        const productKeysToUpdate = new Set(itemsToUpdate.map(getUniversalProductKey));

        allItemsToValidate.forEach(item => {
            const universalProductKey = getUniversalProductKey(item);
            if (productKeysToUpdate.has(universalProductKey)) {
                const currentStatus = newValidationStatus[getItemLineKey(item)] || { main: 'unvalidated', isDifal: false };
                newValidationStatus[getItemLineKey(item)] = { ...currentStatus, main: newMainStatus };
            }
        });

        setValidationStatus(newValidationStatus);
        setHasChanges(true);
    };

    const handleDifalToggle = (itemsToUpdate: CfopValidationData[], forceValue?: boolean) => {
         const newValidationStatus = { ...validationStatus };
        const productKeysToUpdate = new Set(itemsToUpdate.map(getUniversalProductKey));

        allItemsToValidate.forEach(item => {
            const universalProductKey = getUniversalProductKey(item);
            if (productKeysToUpdate.has(universalProductKey)) {
                 const currentStatus = newValidationStatus[getItemLineKey(item)] || { main: 'unvalidated', isDifal: false };
                 const newIsDifal = forceValue !== undefined ? forceValue : !currentStatus.isDifal;
                 newValidationStatus[getItemLineKey(item)] = { ...currentStatus, isDifal: newIsDifal };
            }
        });

        setValidationStatus(newValidationStatus);
        setHasChanges(true);
    };


    const handleSaveChanges = () => {
        if (!competence) return;

        const updatedPersistedData = JSON.parse(JSON.stringify(allPersistedClassifications || {}));
        
        if (!updatedPersistedData[competence]) {
            updatedPersistedData[competence] = { classifications: {}, accountCodes: {}, cfopValidations: { classifications: {} } };
        }
        if (!updatedPersistedData[competence].cfopValidations) {
            updatedPersistedData[competence].cfopValidations = { classifications: {} };
        }

        allItemsToValidate.forEach(item => {
            const newStatus = validationStatus[getItemLineKey(item)];
            const universalProductKey = getUniversalProductKey(item);
            
            if (newStatus) {
                updatedPersistedData[competence].cfopValidations.classifications[universalProductKey] = { 
                    classification: newStatus.main,
                    isDifal: newStatus.isDifal
                };
            }
        });
        
        onPersistAllClassifications(updatedPersistedData);
        setHasChanges(false);
        toast({ title: 'Classificações de CFOP guardadas!' });
    };
    
    const handleBulkClassification = (status: MainValidationStatus | 'toggleDifal' | 'setDifal' | 'unsetDifal') => {
        const table = tableRef.current;
        if (!table) return;

        const selectedItems = table.getFilteredSelectedRowModel().rows.map(row => row.original);
        if (selectedItems.length > 0) {
            if (status === 'toggleDifal') {
                 handleDifalToggle(selectedItems);
            } else if (status === 'setDifal') {
                handleDifalToggle(selectedItems, true);
            } else if (status === 'unsetDifal') {
                 handleDifalToggle(selectedItems, false);
            } else {
                handleMainStatusChange(selectedItems, status as MainValidationStatus);
            }
        }
        
        setRowSelection({}); // Limpa a seleção após a ação
    };


    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            toast({ title: "Copiado", description: `"${text}" copiado para a área de transferência.` });
        }).catch(() => {
            toast({ variant: 'destructive', title: `Falha ao copiar` });
        });
    };

    const renderHeader = (column: any, displayName: string) => {
        return (
            <div 
                className="flex items-center text-left w-full cursor-pointer"
                onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
                <span>{displayName}</span>
                <ArrowUpDown className="ml-2 h-4 w-4" />
            </div>
        );
    };

    const columns = useMemo(() => {
        const baseColumns = getColumnsWithCustomRender(
            allItemsToValidate,
            ['Fornecedor', 'Número da Nota', 'Descrição', 'Sienge_Descrição', 'CFOP', 'CST do ICMS', 'pICMS', 'Sienge_CFOP'],
            (row: any, id: string) => {
                const value = row.original[id];
                 const isCfopColumn = id === 'CFOP' || id === 'Sienge_CFOP';

                if (isCfopColumn) {
                    return (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span className="cursor-help underline decoration-dotted">{value}</span>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{getFullCfopDescription(value)}</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )
                }
                
                if (id === 'Fornecedor' || id === 'Descrição') {
                    return (
                        <div className="flex items-center gap-1 group">
                            <p className="truncate max-w-[200px]" title={value}>{value}</p>
                            <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => copyToClipboard(value)}><Copy className="h-3 w-3" /></Button>
                        </div>
                    );
                }

                 if (id === 'Sienge_Descrição') {
                    return <div className="max-w-xs truncate" title={String(value ?? '')}>{String(value ?? '')}</div>;
                }
                if (id === 'Número da Nota') {
                     return <div className="text-center">{String(value ?? '')}</div>;
                }
                 if (id === 'pICMS') {
                    const displayValue = value === undefined || value === null ? 'Vazio' : value;
                    return <div className="text-center">{displayValue === 'Vazio' ? 'Vazio' : (typeof displayValue === 'number' ? `${displayValue.toFixed(2)}%` : 'N/A')}</div>;
                }
                return <div>{String(value ?? '')}</div>;
            }
        ).map(col => ({
            ...col, 
            header: ({ column }: any) => {
                const displayName = columnNameMap[col.id as string] || col.id;
                return renderHeader(column, displayName);
            }
        }));

         baseColumns.unshift({
            id: 'select',
            header: ({ table }) => (
                <Checkbox
                    checked={table.getIsAllRowsSelected()}
                    onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)}
                    aria-label="Selecionar todas"
                />
            ),
            cell: ({ row }) => (
                <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(!!value)}
                    aria-label="Selecionar linha"
                    onClick={(e) => e.stopPropagation()}
                />
            ),
            enableSorting: false,
            enableHiding: false,
        });

        return baseColumns;

    }, [allItemsToValidate]);

    const actionColumn = useMemo(() => ({
        id: 'Ações',
        header: 'Ações',
        cell: ({ row }: any) => {
            const item = row.original;
            const currentStatus = validationStatus[getItemLineKey(item)] || { main: 'unvalidated', isDifal: false };
            return (
                <TooltipProvider>
                    <div className="flex gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant={currentStatus.main === 'correct' ? 'default' : 'ghost'} className="h-8 w-8" onClick={(e) => {e.stopPropagation(); handleMainStatusChange([item], 'correct')}}><ThumbsUp className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Marcar como Correto</p></TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant={currentStatus.main === 'incorrect' ? 'destructive' : 'ghost'} className="h-8 w-8" onClick={(e) => {e.stopPropagation(); handleMainStatusChange([item], 'incorrect')}}><ThumbsDown className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Marcar como Incorreto</p></TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant={currentStatus.main === 'verify' ? 'secondary' : 'ghost'} className="h-8 w-8" onClick={(e) => {e.stopPropagation(); handleMainStatusChange([item], 'verify')}}><Search className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Marcar para Verificar</p></TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant={currentStatus.isDifal ? 'default' : 'ghost'} className={cn("h-8 w-8", currentStatus.isDifal && "bg-purple-600 hover:bg-purple-700 text-white")} onClick={(e) => {e.stopPropagation(); handleDifalToggle([item])}}><TicketPercent className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Alternar DIFAL</p></TooltipContent></Tooltip>
                        {currentStatus.main !== 'unvalidated' && (
                             <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => {e.stopPropagation(); handleMainStatusChange([item], 'unvalidated')}}><RotateCcw className="h-5 w-5 text-muted-foreground" /></Button></TooltipTrigger><TooltipContent><p>Reverter para Pendente</p></TooltipContent></Tooltip>
                        )}
                    </div>
                </TooltipProvider>
            );
        }
    }), [validationStatus]);
    
    const statusColumn = useMemo(() => ({
        id: 'status',
        header: 'Status',
        cell: ({ row }: any) => {
            const currentStatus = validationStatus[getItemLineKey(row.original)] || { main: 'unvalidated', isDifal: false };
            let mainBadge;
            switch(currentStatus.main) {
                case 'correct': mainBadge = <Badge variant="default" className='bg-green-600 hover:bg-green-700'><CheckCircle className="h-4 w-4 mr-1" /> Correto</Badge>; break;
                case 'incorrect': mainBadge = <Badge variant="destructive"><AlertTriangle className="h-4 w-4 mr-1" /> Incorreto</Badge>; break;
                case 'verify': mainBadge = <Badge variant="secondary" className='bg-amber-500 text-white hover:bg-amber-600'><Search className="h-4 w-4 mr-1" /> Verificar</Badge>; break;
                default: mainBadge = <Badge variant="outline"><FileWarning className="h-4 w-4 mr-1" /> Pendente</Badge>;
            }
            return (
                <div className="flex items-center gap-2">
                    {mainBadge}
                    {currentStatus.isDifal && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger>
                                     <Badge variant="default" className='bg-purple-600 hover:bg-purple-700'><TicketPercent className="h-4 w-4" /></Badge>
                                </TooltipTrigger>
                                <TooltipContent><p>Marcado para DIFAL</p></TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </div>
            )
        }
    }), [validationStatus]);
    
    const allGroupedItems = useMemo((): GroupedItems => {
        const groups: GroupedItems = {};
        
        const addOrUpdateGroup = (groupKey: string, item: CfopValidationData) => {
            if (!groups[groupKey]) {
                groups[groupKey] = { items: [], xmlCfops: new Set(), xmlCsts: new Set(), xmlPIcms: new Set() };
            }
            const group = groups[groupKey];
            group.items.push(item);
            if (item.CFOP) group.xmlCfops.add(item.CFOP);
            const itemCst = item['CST do ICMS'] === undefined || item['CST do ICMS'] === null ? 'Vazio' : item['CST do ICMS'];
            group.xmlCsts.add(itemCst);
            const itemPIcms = item['pICMS'] === undefined || item['pICMS'] === null ? 'Vazio' : String(item['pICMS']);
            group.xmlPIcms.add(itemPIcms);
        };
    
        // Primeiro, processa os itens conciliados que têm um Sienge_CFOP
        (reconciledItems || []).forEach(item => {
            if (item.Sienge_CFOP) {
                addOrUpdateGroup(item.Sienge_CFOP, item);
            }
        });

        // Depois, processa os itens de imobilizado
        (imobilizadoItems || []).forEach(item => {
            // Tenta encontrar uma correspondência nos itens conciliados para obter o Sienge_CFOP
            const reconciledMatch = reconciledItems?.find(r => getItemLineKey(r) === getItemLineKey(item));
            const siengeCfop = reconciledMatch?.Sienge_CFOP;

            if (siengeCfop) {
                // Se já foi adicionado pelo loop anterior, não adiciona de novo para evitar duplicados
                if (!groups[siengeCfop]?.items.some(i => getItemLineKey(i) === getItemLineKey(item))) {
                    addOrUpdateGroup(siengeCfop, item);
                }
            } else {
                // Se não tem Sienge_CFOP, agrupa em "IMOBILIZADO"
                addOrUpdateGroup('IMOBILIZADO', item);
            }
        });
    
        return groups;
    }, [reconciledItems, imobilizadoItems]);
    
    const [activeTabGroup, setActiveTabGroup] = useState<string>('');
    const tableRef = React.useRef<ReactTable<CfopValidationData> | null>(null);

    const fullColumns = useMemo(() => {
        const tempCols = [...columns];
        tempCols.push(statusColumn, actionColumn);
        return tempCols;
    }, [columns, statusColumn, actionColumn]);
    
    const statusCounts = useMemo(() => {
        const counts: Record<MainValidationStatus | 'all', number> = { all: 0, unvalidated: 0, correct: 0, incorrect: 0, verify: 0 };
        const itemsToCount = allItemsToValidate.filter(item => {
            const groupKey = item.Sienge_CFOP || (imobilizadoItems.some(i => getItemLineKey(i) === getItemLineKey(item)) ? 'IMOBILIZADO' : null);
            if (!groupKey) return false;

            const groupData = allGroupedItems[groupKey];
            if (!groupData) return true;

            const { cfops: includedCfops, csts: includedCsts, picms: includedPIcms } = perTabFilters[groupKey] || {
                cfops: groupData.xmlCfops, csts: groupData.xmlCsts, picms: groupData.xmlPIcms
            };
            
            const cfopOk = includedCfops.size === 0 || includedCfops.has(item.CFOP);
            const itemCst = item['CST do ICMS'] === undefined || item['CST do ICMS'] === null ? 'Vazio' : item['CST do ICMS'];
            const cstOk = includedCsts.size === 0 || includedCsts.has(itemCst);
            const itemPIcms = item['pICMS'] === undefined || item['pICMS'] === null ? 'Vazio' : String(item['pICMS']);
            const picmsOk = includedPIcms.size === 0 || includedPIcms.has(itemPIcms);

            return cfopOk && cstOk && picmsOk;
        });

        itemsToCount.forEach(item => {
            const status = validationStatus[getItemLineKey(item)]?.main || 'unvalidated';
            counts.all++;
            counts[status]++;
        });
        return counts;
    }, [validationStatus, allItemsToValidate, perTabFilters, allGroupedItems, imobilizadoItems]);

    const visibleGroupTitles = useMemo(() => {
        const siengeCfops = Object.keys(allGroupedItems)
            .filter(cfop => cfop !== 'IMOBILIZADO')
            .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

        const baseGroups = allGroupedItems['IMOBILIZADO'] ? ['IMOBILIZADO', ...siengeCfops] : siengeCfops;

        return baseGroups.filter(siengeCfop => {
            const groupItems = allGroupedItems[siengeCfop].items;
            return groupItems.some(item => {
                 const statusOk = activeFilter === 'all' || (validationStatus[getItemLineKey(item)]?.main || 'unvalidated') === activeFilter;
                 if (!statusOk) return false;
                 
                 const { cfops: includedCfops, csts: includedCsts, picms: includedPIcms } = perTabFilters[siengeCfop] || {
                     cfops: allGroupedItems[siengeCfop].xmlCfops,
                     csts: allGroupedItems[siengeCfop].xmlCsts,
                     picms: allGroupedItems[siengeCfop].xmlPIcms,
                 };
                const cfopOk = includedCfops.size === 0 || includedCfops.has(item.CFOP);
                const itemCst = item['CST do ICMS'] === undefined || item['CST do ICMS'] === null ? 'Vazio' : item['CST do ICMS'];
                const cstOk = includedCsts.size === 0 || includedCsts.has(itemCst);
                const itemPIcms = item['pICMS'] === undefined || item['pICMS'] === null ? 'Vazio' : String(item['pICMS']);
                const picmsOk = includedPIcms.size === 0 || includedPIcms.has(itemPIcms);
                return cfopOk && cstOk && picmsOk;
            });
        });
    }, [allGroupedItems, validationStatus, activeFilter, perTabFilters]);

    const itemsForActiveTab = useMemo(() => {
        if (!activeTabGroup || !allGroupedItems[activeTabGroup]) {
            return [];
        }

        const groupData = allGroupedItems[activeTabGroup];
        const { cfops: includedCfops, csts: includedCsts, picms: includedPIcms } = perTabFilters[activeTabGroup] || {
            cfops: groupData.xmlCfops,
            csts: groupData.xmlCsts,
            picms: groupData.xmlPIcms,
        };

        return groupData.items.filter(item => {
            const statusOk = activeFilter === 'all' || (validationStatus[getItemLineKey(item)]?.main || 'unvalidated') === activeFilter;
            if (!statusOk) return false;

            const cfopOk = includedCfops.size === 0 || includedCfops.has(item.CFOP);
            const itemCst = item['CST do ICMS'] === undefined || item['CST do ICMS'] === null ? 'Vazio' : item['CST do ICMS'];
            const cstOk = includedCsts.size === 0 || includedCsts.has(itemCst);
            const itemPIcms = item['pICMS'] === undefined || item['pICMS'] === null ? 'Vazio' : String(item['pICMS']);
            const picmsOk = includedPIcms.size === 0 || includedPIcms.has(itemPIcms);
            
            return cfopOk && cstOk && picmsOk;
        });

    }, [activeTabGroup, allGroupedItems, validationStatus, activeFilter, perTabFilters]);
    
    const filterOptionsForModal = useMemo(() => {
        if (!currentEditingGroup || !allGroupedItems[currentEditingGroup]) {
            return { cfops: [], csts: [], picms: [] };
        }
        
        const groupItems = allGroupedItems[currentEditingGroup].items;
        const visibleItems = groupItems.filter(item => 
            activeFilter === 'all' || (validationStatus[getItemLineKey(item)]?.main || 'unvalidated') === activeFilter
        );
        
        const cfops = new Set(visibleItems.map(item => item.CFOP).filter(Boolean));
        const csts = new Set(visibleItems.map(item => item['CST do ICMS'] === undefined || item['CST do ICMS'] === null ? 'Vazio' : item['CST do ICMS']));
        const picms = new Set(visibleItems.map(item => item['pICMS'] === undefined || item['pICMS'] === null ? 'Vazio' : String(item['pICMS'])));
        
        return {
            cfops: Array.from(cfops).sort(),
            csts: Array.from(csts).sort(),
            picms: Array.from(picms).sort((a,b) => {
                if (a === 'Vazio') return -1;
                if (b === 'Vazio') return 1;
                return parseFloat(a) - parseFloat(b)
            }),
        };
    }, [currentEditingGroup, allGroupedItems, activeFilter, validationStatus]);
    
    useEffect(() => {
        if (visibleGroupTitles.length > 0 && !visibleGroupTitles.includes(activeTabGroup)) {
            setActiveTabGroup(visibleGroupTitles[0]);
        } else if (visibleGroupTitles.length === 0) {
            setActiveTabGroup('');
        }
    }, [visibleGroupTitles, activeTabGroup]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (Object.keys(rowSelection).length > 0) {
                    setRowSelection({});
                }
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [rowSelection]);


    const numSelected = Object.keys(rowSelection).length;
    
    const handleClearFilters = () => {
        if (tableRef.current) {
            tableRef.current.resetColumnFilters();
            tableRef.current.setGlobalFilter('');
        }
    };

    const openFilterModal = (siengeCfopGroup: string) => {
        if (!allGroupedItems[siengeCfopGroup]) return;
        const currentFilters = perTabFilters[siengeCfopGroup];
        const allOptions = allGroupedItems[siengeCfopGroup];

        setCurrentEditingGroup(siengeCfopGroup);
        
        setTempIncludedCfops(currentFilters?.cfops || allOptions.xmlCfops);
        setTempIncludedCsts(currentFilters?.csts || allOptions.xmlCsts);
        setTempIncludedPIcms(currentFilters?.picms || allOptions.xmlPIcms);
        
        setIsFilterModalOpen(true);
    };

    const handleSaveFilters = () => {
        if (!currentEditingGroup) return;

        const newPerTabFilters = { 
            ...perTabFilters, 
            [currentEditingGroup]: {
                cfops: tempIncludedCfops,
                csts: tempIncludedCsts,
                picms: tempIncludedPIcms,
            } 
        };
        setPerTabFilters(newPerTabFilters);

        const serializableFilters: Record<string, { cfops: string[], csts: string[], picms: string[] }> = {};
        for (const key in newPerTabFilters) {
            serializableFilters[key] = {
                cfops: Array.from(newPerTabFilters[key].cfops),
                csts: Array.from(newPerTabFilters[key].csts),
                picms: Array.from(newPerTabFilters[key].picms),
            };
        }
        localStorage.setItem(CFOP_VALIDATION_FILTERS_KEY, JSON.stringify(serializableFilters));

        setIsFilterModalOpen(false);
        toast({ title: 'Filtros guardados!' });
    };

    if (!allItemsToValidate || allItemsToValidate.length === 0) {
        return (
             <div className="text-center p-8 text-muted-foreground">
                <FileWarning className="mx-auto h-12 w-12 mb-4" />
                <h3 className="text-xl font-semibold">Nenhum item para validar</h3>
                <p>Execute a validação e carregue a planilha do Sienge para iniciar a conciliação e validação de CFOPs.</p>
             </div>
        );
    }

    const currentTabFilters = perTabFilters[activeTabGroup];
    const allCfopsForTab = allGroupedItems[activeTabGroup]?.xmlCfops;
    const allCstsForTab = allGroupedItems[activeTabGroup]?.xmlCsts;
    const allPIcmsForTab = allGroupedItems[activeTabGroup]?.xmlPIcms;
    const isCfopFilterActive = currentTabFilters && allCfopsForTab && currentTabFilters.cfops.size < allCfopsForTab.size;
    const isCstFilterActive = currentTabFilters && allCstsForTab && currentTabFilters.csts.size < allCstsForTab.size;
    const isPIcmsFilterActive = currentTabFilters && allPIcmsForTab && currentTabFilters.picms.size < allPIcmsForTab.size;
    const isAnyFilterActive = isCfopFilterActive || isCstFilterActive || isPIcmsFilterActive;

    return (
        <div className="space-y-4 h-full flex flex-col relative">
             <div className="flex justify-between items-center">
                <Tabs defaultValue="unvalidated" value={activeFilter} onValueChange={(value) => setActiveFilter(value as any)} className="w-full">
                    <TabsList className="grid w-full grid-cols-5">
                        <TabsTrigger value="all">Todos ({statusCounts.all})</TabsTrigger>
                        <TabsTrigger value="unvalidated">Pendentes ({statusCounts.unvalidated})</TabsTrigger>
                        <TabsTrigger value="correct">Corretos ({statusCounts.correct})</TabsTrigger>
                        <TabsTrigger value="incorrect">Incorretos ({statusCounts.incorrect})</TabsTrigger>
                        <TabsTrigger value="verify">A Verificar ({statusCounts.verify})</TabsTrigger>
                    </TabsList>
                </Tabs>
                <div className="flex gap-2 ml-4">
                    <Button variant="outline" onClick={handleClearFilters} className='shrink-0'>
                        <FilterX className="mr-2 h-4 w-4" />
                        Limpar Filtros
                    </Button>
                    <Button onClick={handleSaveChanges} disabled={!hasChanges}>
                        <Save className="mr-2 h-4 w-4" /> Guardar Alterações
                    </Button>
                </div>
            </div>
             
             <div className="flex-grow overflow-y-auto">
                <Tabs value={activeTabGroup} onValueChange={setActiveTabGroup} className="w-full">
                    <TabsList className="h-auto flex-wrap justify-start">
                         {visibleGroupTitles.map(title => {
                            const group = allGroupedItems[title];
                            if (!group) return null;
                            const count = group.items.filter(item => {
                                const statusOk = activeFilter === 'all' || (validationStatus[getItemLineKey(item)]?.main || 'unvalidated') === activeFilter;
                                if (!statusOk) return false;
                                
                                const { cfops: includedCfops, csts: includedCsts, picms: includedPIcms } = perTabFilters[title] || {
                                    cfops: group.xmlCfops, csts: group.xmlCsts, picms: group.xmlPIcms
                                };
                                const cfopOk = includedCfops.size === 0 || includedCfops.has(item.CFOP);
                                const itemCst = item['CST do ICMS'] === undefined || item['CST do ICMS'] === null ? 'Vazio' : item['CST do ICMS'];
                                const cstOk = includedCsts.size === 0 || includedCsts.has(itemCst);
                                const itemPIcms = item['pICMS'] === undefined || item['pICMS'] === null ? 'Vazio' : String(item['pICMS']);
                                const picmsOk = includedPIcms.size === 0 || includedPIcms.has(itemPIcms);
                                return cfopOk && cstOk && picmsOk;
                            }).length;

                            if (count > 0) {
                                if (title === 'IMOBILIZADO') {
                                    return <TabsTrigger key={title} value={title} className="flex items-center gap-2"><Building className="h-4 w-4"/>Imobilizado ({count})</TabsTrigger>
                                }
                                return <TabsTrigger key={title} value={title}>{title} ({count})</TabsTrigger>
                            }
                            return null;
                        })}
                    </TabsList>

                    {visibleGroupTitles.length > 0 ? (
                         <TabsContent key={activeTabGroup} value={activeTabGroup} className='mt-4'>
                             {(() => {
                                 const title = activeTabGroup;
                                 if (!title) return null;
                                 const description = title === 'IMOBILIZADO' 
                                    ? 'Itens classificados como Ativo Imobilizado na etapa anterior.' 
                                    : getFullCfopDescription(title);
                                return (
                                    <>
                                         <div className='mb-4 p-3 border rounded-md bg-muted/50 flex justify-between items-center'>
                                            <h3 className="text-lg font-semibold">Grupo {title}: <span className="font-normal">{description}</span></h3>
                                             <Button variant="outline" onClick={() => openFilterModal(title)} size="icon" title="Filtrar por CFOP e CST do XML" className={isAnyFilterActive ? 'relative text-blue-600 border-blue-600 hover:text-blue-700' : ''}>
                                                <ListFilter className="h-4 w-4" />
                                                {isAnyFilterActive && <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span></span>}
                                            </Button>
                                        </div>
                                         <DataTable
                                            columns={fullColumns}
                                            data={itemsForActiveTab}
                                            rowSelection={rowSelection}
                                            setRowSelection={setRowSelection}
                                            tableRef={tableRef}
                                        />
                                    </>
                                )
                            })()}
                        </TabsContent>
                    ) : (
                         <div className="text-center p-8 text-muted-foreground">
                            <FileWarning className="mx-auto h-12 w-12 mb-4" />
                            <h3 className="text-xl font-semibold">Nenhum item encontrado</h3>
                            <p>Não há itens com o status "{activeFilter}" para os CFOPs selecionados.</p>
                         </div>
                    )}
                </Tabs>
            </div>

            {numSelected > 0 && (
                <div className="sticky bottom-4 z-20 w-full flex justify-center">
                    <Card className="flex items-center gap-4 p-3 shadow-2xl animate-in fade-in-0 slide-in-from-bottom-5">
                         <span className="text-sm font-medium pl-2">{numSelected} item(ns) selecionado(s)</span>
                        <div className="h-6 border-l" />
                         <span className="text-sm font-medium">Classificar como:</span>
                         <div className="flex gap-2">
                             <Button size="sm" onClick={() => handleBulkClassification('correct')}><ThumbsUp className="mr-2 h-4 w-4" /> Correto</Button>
                             <Button size="sm" variant="destructive" onClick={() => handleBulkClassification('incorrect')}><ThumbsDown className="mr-2 h-4 w-4" /> Incorreto</Button>
                             <Button size="sm" variant="secondary" onClick={() => handleBulkClassification('verify')}><Search className="mr-2 h-4 w-4" /> Verificar</Button>
                             <Button size="sm" className="bg-purple-600 hover:bg-purple-700" onClick={() => handleBulkClassification('setDifal')}><TicketPercent className="mr-2 h-4 w-4" /> Marcar DIFAL</Button>
                             <Button size="sm" variant="outline" className="bg-purple-100 dark:bg-purple-900/40" onClick={() => handleBulkClassification('unsetDifal')}><TicketPercent className="mr-2 h-4 w-4 text-purple-600" /> Desmarcar DIFAL</Button>
                             <Button size="sm" variant="outline" onClick={() => handleBulkClassification('unvalidated')}><RotateCcw className="mr-2 h-4 w-4" /> Reverter</Button>
                         </div>
                    </Card>
                </div>
            )}
             
             {currentEditingGroup && (
                <Dialog open={isFilterModalOpen} onOpenChange={setIsFilterModalOpen}>
                    <DialogContent className="max-w-4xl">
                        <DialogHeader>
                            <DialogTitle>Filtrar Dados para o Grupo {currentEditingGroup}</DialogTitle>
                            <DialogDescription>
                                Desmarque os itens que deseja ocultar da visualização deste grupo.
                            </DialogDescription>
                        </DialogHeader>
                        <Tabs defaultValue="cfop" className="w-full">
                            <TabsList className="grid w-full grid-cols-3">
                                <TabsTrigger value="cfop">Filtro por CFOP ({filterOptionsForModal.cfops.length})</TabsTrigger>
                                <TabsTrigger value="cst">Filtro por CST ({filterOptionsForModal.csts.length})</TabsTrigger>
                                <TabsTrigger value="picms">Filtro por Alíquota ({filterOptionsForModal.picms.length})</TabsTrigger>
                            </TabsList>
                            <TabsContent value="cfop" className="mt-4">
                                <div className="flex justify-end gap-2 mb-2">
                                    <Button variant="outline" size="sm" onClick={() => setTempIncludedCfops(new Set(filterOptionsForModal.cfops))}>Selecionar Todos</Button>
                                    <Button variant="outline" size="sm" onClick={() => setTempIncludedCfops(new Set())}>Limpar Seleção</Button>
                                </div>
                                <ScrollArea className="h-80 w-full rounded-md border p-4">
                                {filterOptionsForModal.cfops.map(cfop => (
                                    <div key={cfop} className="flex items-center justify-between p-2 rounded-md hover:bg-muted">
                                        <div className='flex items-center space-x-2'>
                                            <Checkbox
                                                id={`cfop-filter-${cfop}`}
                                                checked={tempIncludedCfops.has(cfop)}
                                                onCheckedChange={(checked) => setTempIncludedCfops(prev => { const n = new Set(prev); if(checked) n.add(cfop); else n.delete(cfop); return n; })}
                                            />
                                            <Label htmlFor={`cfop-filter-${cfop}`} className="flex flex-col">
                                                <Badge variant="secondary">{cfop}</Badge>
                                                <span className="ml-2 text-xs text-muted-foreground">{getFullCfopDescription(cfop)}</span>
                                            </Label>
                                        </div>
                                    </div>
                                ))}
                                </ScrollArea>
                            </TabsContent>
                             <TabsContent value="cst" className="mt-4">
                                 <div className="flex justify-end gap-2 mb-2">
                                    <Button variant="outline" size="sm" onClick={() => setTempIncludedCsts(new Set(filterOptionsForModal.csts))}>Selecionar Todos</Button>
                                    <Button variant="outline" size="sm" onClick={() => setTempIncludedCsts(new Set())}>Limpar Seleção</Button>
                                </div>
                                <ScrollArea className="h-80 w-full rounded-md border p-4">
                                {filterOptionsForModal.csts.map(cst => (
                                    <div key={cst} className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted">
                                        <Checkbox
                                            id={`cst-filter-${cst}`}
                                            checked={tempIncludedCsts.has(cst)}
                                            onCheckedChange={(checked) => setTempIncludedCsts(prev => { const n = new Set(prev); if(checked) n.add(cst); else n.delete(cst); return n; })}
                                        />
                                        <Label htmlFor={`cst-filter-${cst}`} className="flex flex-col">
                                            <Badge variant="outline">{cst || "Sem CST"}</Badge>
                                        </Label>
                                    </div>
                                ))}
                                </ScrollArea>
                            </TabsContent>
                            <TabsContent value="picms" className="mt-4">
                                <div className="flex justify-end gap-2 mb-2">
                                    <Button variant="outline" size="sm" onClick={() => setTempIncludedPIcms(new Set(filterOptionsForModal.picms))}>Selecionar Todos</Button>
                                    <Button variant="outline" size="sm" onClick={() => setTempIncludedPIcms(new Set())}>Limpar Seleção</Button>
                                </div>
                                <ScrollArea className="h-80 w-full rounded-md border p-4">
                                {filterOptionsForModal.picms.map(picms => (
                                    <div key={picms} className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted">
                                        <Checkbox
                                            id={`picms-filter-${picms}`}
                                            checked={tempIncludedPIcms.has(picms)}
                                            onCheckedChange={(checked) => setTempIncludedPIcms(prev => { const n = new Set(prev); if(checked) n.add(picms); else n.delete(picms); return n; })}
                                        />
                                        <Label htmlFor={`picms-filter-${picms}`} className="flex flex-col">
                                            <Badge variant="outline">{picms === 'Vazio' ? 'Vazio' : `${picms}%`}</Badge>
                                        </Label>
                                    </div>
                                ))}
                                </ScrollArea>
                            </TabsContent>
                        </Tabs>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsFilterModalOpen(false)}>Cancelar</Button>
                            <Button onClick={handleSaveFilters}>Guardar Filtros</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
             )}
        </div>
    );
}

