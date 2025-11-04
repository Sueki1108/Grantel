
"use client";

import * as React from "react";
import { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/lib/columns-helper";
import { ThumbsDown, ThumbsUp, RotateCcw, AlertTriangle, CheckCircle, FileWarning, Search, ArrowUpDown, FilterX, Copy, Save, Settings } from "lucide-react";
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


// Tipos
export interface CfopValidationData extends Record<string, any> {
    'Chave de acesso': string;
    'Número da Nota': string;
    'CPF/CNPJ do Emitente': string;
    'Código': string; // Código do produto no XML
    'Sienge_CFOP': string; // CFOP do Sienge
    'Sienge_Descrição': string;
    'Fornecedor': string; // Nome do fornecedor do XML
    'Descrição': string; // Descrição do item no XML
    'CFOP': string; // CFOP do XML
    'CST do ICMS'?: string; // CST do ICMS do XML
}

type ValidationStatus = 'unvalidated' | 'correct' | 'incorrect' | 'verify';

interface GroupedItems {
  [siengeCfop: string]: {
    items: CfopValidationData[];
    xmlCfops: Set<string>;
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
};

const CFOP_VALIDATION_PER_TAB_FILTER_KEY = 'cfopValidationPerTabFilters';


interface CfopValidatorProps {
    items: CfopValidationData[];
    allPersistedClassifications: AllClassifications;
    onPersistAllClassifications: (allData: AllClassifications) => void;
    competence: string | null;
}

const getUniversalProductKey = (item: CfopValidationData): string => {
    // Chave universal do produto (ignora região do CFOP)
    const siengeCfopNature = (item['Sienge_CFOP'] || '').slice(-3);
    return `${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}-${siengeCfopNature}`;
};

const getItemLineKey = (item: CfopValidationData): string => {
    // Chave única para a linha da tabela
    return item['Chave de acesso'] + item.Item;
};


export function CfopValidator({ items, allPersistedClassifications, onPersistAllClassifications, competence }: CfopValidatorProps) {
    const { toast } = useToast();
    const [validationStatus, setValidationStatus] = useState<Record<string, ValidationStatus>>({});
    const [hasChanges, setHasChanges] = useState(false);
    const [activeFilter, setActiveFilter] = useState<ValidationStatus | 'all'>('unvalidated');
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

    const [isCfopModalOpen, setIsCfopModalOpen] = useState(false);
    const [perTabCfopFilters, setPerTabCfopFilters] = useState<Record<string, Set<string>>>({});
    const [currentEditingCfopGroup, setCurrentEditingCfopGroup] = useState<string | null>(null);
    const [tempIncludedXmlCfops, setTempIncludedXmlCfops] = useState<Set<string>>(new Set());

    const reconciledItems = useMemo(() => items.filter(item => item && item.Observações?.startsWith('Conciliado')), [items]);
    
    useEffect(() => {
        try {
            const savedFiltersRaw = localStorage.getItem(CFOP_VALIDATION_PER_TAB_FILTER_KEY);
            if (savedFiltersRaw) {
                const savedFilters = JSON.parse(savedFiltersRaw);
                const restoredFilters: Record<string, Set<string>> = {};
                for (const key in savedFilters) {
                    restoredFilters[key] = new Set(savedFilters[key]);
                }
                setPerTabCfopFilters(restoredFilters);
            }
        } catch (e) {
            console.error("Failed to load CFOP filters:", e);
        }
    }, []);


    useEffect(() => {
        if (!competence) return;
        const initialStatus: Record<string, ValidationStatus> = {};

        reconciledItems.forEach(item => {
            const universalProductKey = getUniversalProductKey(item);
            let classification: ValidationStatus | undefined = undefined;

            // Look through all past competences for a classification
            for (const otherCompetence in allPersistedClassifications) {
                const historicClassification = allPersistedClassifications[otherCompetence]?.cfopValidations?.classifications?.[universalProductKey]?.classification as ValidationStatus;
                if (historicClassification && historicClassification !== 'unvalidated') {
                    classification = historicClassification;
                    break;
                }
            }
            
            initialStatus[getItemLineKey(item)] = classification || 'unvalidated';
        });

        setValidationStatus(initialStatus);
        setHasChanges(false);
    }, [reconciledItems, allPersistedClassifications, competence]);


     const handleValidationChange = (itemsToUpdate: CfopValidationData[], newStatus: ValidationStatus) => {
        const newValidationStatus = { ...validationStatus };
        const productKeysToUpdate = new Set(itemsToUpdate.map(getUniversalProductKey));

        reconciledItems.forEach(item => {
            const universalProductKey = getUniversalProductKey(item);
            if (productKeysToUpdate.has(universalProductKey)) {
                newValidationStatus[getItemLineKey(item)] = newStatus;
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

        reconciledItems.forEach(item => {
            const newStatus = validationStatus[getItemLineKey(item)];
            const universalProductKey = getUniversalProductKey(item);
            
            if (newStatus && newStatus !== 'unvalidated') {
                updatedPersistedData[competence].cfopValidations.classifications[universalProductKey] = { classification: newStatus };
            } else if (newStatus === 'unvalidated') {
                // Remove from current competence if it exists
                if (updatedPersistedData[competence].cfopValidations.classifications[universalProductKey]) {
                    delete updatedPersistedData[competence].cfopValidations.classifications[universalProductKey];
                }
            }
        });
        
        onPersistAllClassifications(updatedPersistedData);
        setHasChanges(false);
        toast({ title: 'Classificações de CFOP guardadas!' });
    };
    
    const handleBulkClassification = (newStatus: ValidationStatus) => {
        const table = tableRef.current;
        if (!table) return;

        const selectedItems = table.getFilteredSelectedRowModel().rows.map(row => row.original);
        if (selectedItems.length > 0) {
            handleValidationChange(selectedItems, newStatus);
        }
        
        setRowSelection({}); // Limpa a seleção após a ação
    };

    const getFullCfopDescription = (cfopCode: string | number): string => {
        const code = parseInt(String(cfopCode), 10);
        return cfopDescriptions[code as keyof typeof cfopDescriptions] || "Descrição não encontrada";
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
            reconciledItems,
            ['Fornecedor', 'Número da Nota', 'Descrição', 'Sienge_Descrição', 'CFOP', 'CST do ICMS', 'Sienge_CFOP'],
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

    }, [reconciledItems]);

    const actionColumn = useMemo(() => ({
        id: 'Ações',
        header: 'Ações',
        cell: ({ row }: any) => {
            const item = row.original;
            const currentStatus = validationStatus[getItemLineKey(item)] || 'unvalidated';
            return (
                <TooltipProvider>
                    <div className="flex gap-2 justify-center" onClick={(e) => e.stopPropagation()}>
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant={currentStatus === 'correct' ? 'default' : 'ghost'} className="h-8 w-8" onClick={(e) => {e.stopPropagation(); handleValidationChange([item], 'correct')}}><ThumbsUp className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Marcar como Correto (e todos iguais)</p></TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant={currentStatus === 'incorrect' ? 'destructive' : 'ghost'} className="h-8 w-8" onClick={(e) => {e.stopPropagation(); handleValidationChange([item], 'incorrect')}}><ThumbsDown className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Marcar como Incorreto (e todos iguais)</p></TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant={currentStatus === 'verify' ? 'secondary' : 'ghost'} className="h-8 w-8" onClick={(e) => {e.stopPropagation(); handleValidationChange([item], 'verify')}}><Search className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Marcar para Verificar (e todos iguais)</p></TooltipContent></Tooltip>
                        {currentStatus !== 'unvalidated' && (
                             <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => {e.stopPropagation(); handleValidationChange([item], 'unvalidated')}}><RotateCcw className="h-5 w-5 text-muted-foreground" /></Button></TooltipTrigger><TooltipContent><p>Reverter para Pendente (e todos iguais)</p></TooltipContent></Tooltip>
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
            const currentStatus = validationStatus[getItemLineKey(row.original)] || 'unvalidated';
            switch(currentStatus) {
                case 'correct': return <Badge variant="default" className='bg-green-600 hover:bg-green-700'><CheckCircle className="h-4 w-4 mr-1" /> Correto</Badge>;
                case 'incorrect': return <Badge variant="destructive"><AlertTriangle className="h-4 w-4 mr-1" /> Incorreto</Badge>;
                 case 'verify': return <Badge variant="secondary" className='bg-amber-500 text-white hover:bg-amber-600'><Search className="h-4 w-4 mr-1" /> Verificar</Badge>;
                default: return <Badge variant="outline"><FileWarning className="h-4 w-4 mr-1" /> Pendente</Badge>;
            }
        }
    }), [validationStatus]);
    
    const allGroupedItems = useMemo((): GroupedItems => {
        const groups: GroupedItems = {};
        reconciledItems.forEach(item => {
            const siengeCfop = item.Sienge_CFOP;
            if (!groups[siengeCfop]) {
                groups[siengeCfop] = { items: [], xmlCfops: new Set() };
            }
            groups[siengeCfop].items.push(item);
            if (item.CFOP) {
                groups[siengeCfop].xmlCfops.add(item.CFOP);
            }
        });
        return groups;
    }, [reconciledItems]);
    
    const [activeTabGroup, setActiveTabGroup] = useState<string>('');
    const tableRef = React.useRef<ReactTable<CfopValidationData> | null>(null);

    const fullColumns = useMemo(() => [ ...columns, statusColumn, actionColumn], [columns, statusColumn, actionColumn]);
    
    const visibleGroupTitles = useMemo(() => {
        return Object.keys(allGroupedItems).filter(siengeCfop => {
            if (activeFilter === 'all') return true; 
            
            return allGroupedItems[siengeCfop].items.some(item => 
                (validationStatus[getItemLineKey(item)] || 'unvalidated') === activeFilter
            );
        }).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    }, [allGroupedItems, validationStatus, activeFilter]);


    const itemsForActiveTab = useMemo(() => {
        if (!activeTabGroup || !allGroupedItems[activeTabGroup]) {
            return [];
        }

        const groupData = allGroupedItems[activeTabGroup];
        const includedXmlCfopsForTab = perTabCfopFilters[activeTabGroup] || groupData.xmlCfops;

        return groupData.items.filter(item => {
            const statusOk = activeFilter === 'all' || (validationStatus[getItemLineKey(item)] || 'unvalidated') === activeFilter;
            const cfopOk = includedXmlCfopsForTab.has(item.CFOP);
            return statusOk && cfopOk;
        });

    }, [activeTabGroup, allGroupedItems, validationStatus, activeFilter, perTabCfopFilters]);
    
    
    useEffect(() => {
        if (visibleGroupTitles.length > 0 && !visibleGroupTitles.includes(activeTabGroup)) {
            setActiveTabGroup(visibleGroupTitles[0]);
        } else if (visibleGroupTitles.length === 0) {
            setActiveTabGroup('');
        }
    }, [visibleGroupTitles, activeTabGroup]);

    const numSelected = Object.keys(rowSelection).length;
    
    const handleClearFilters = () => {
        if (tableRef.current) {
            tableRef.current.resetColumnFilters();
            tableRef.current.setGlobalFilter('');
        }
    };
    
    const handleCfopFilterToggle = (cfop: string, checked: boolean) => {
        const newSet = new Set(tempIncludedXmlCfops);
        if (checked) newSet.add(cfop); else newSet.delete(cfop);
        setTempIncludedXmlCfops(newSet);
    };

    const openCfopFilterModal = (siengeCfopGroup: string) => {
        const allXmlCfopsForGroup = allGroupedItems[siengeCfopGroup]?.xmlCfops || new Set();
        const currentFilters = perTabCfopFilters[siengeCfopGroup] || allXmlCfopsForGroup;
        
        setCurrentEditingCfopGroup(siengeCfopGroup);
        setTempIncludedXmlCfops(new Set(currentFilters));
        setIsCfopModalOpen(true);
    };

    const handleSaveCfopFilter = () => {
        if (!currentEditingCfopGroup) return;

        const newPerTabFilters = { ...perTabCfopFilters, [currentEditingCfopGroup]: tempIncludedXmlCfops };
        setPerTabCfopFilters(newPerTabFilters);

        const serializableFilters: Record<string, string[]> = {};
        for (const key in newPerTabFilters) {
            serializableFilters[key] = Array.from(newPerTabFilters[key]);
        }
        localStorage.setItem(CFOP_VALIDATION_PER_TAB_FILTER_KEY, JSON.stringify(serializableFilters));

        setIsCfopModalOpen(false);
        toast({ title: 'Filtro de CFOP guardado!' });
    };

    return (
        <div className="space-y-4 h-full flex flex-col relative">
             <div className="flex justify-between items-center">
                <Tabs defaultValue="unvalidated" value={activeFilter} onValueChange={(value) => setActiveFilter(value as any)} className="w-full">
                    <TabsList className="grid w-full grid-cols-5">
                        <TabsTrigger value="all">Todos</TabsTrigger>
                        <TabsTrigger value="unvalidated">Pendentes</TabsTrigger>
                        <TabsTrigger value="correct">Corretos</TabsTrigger>
                        <TabsTrigger value="incorrect">Incorretos</TabsTrigger>
                        <TabsTrigger value="verify">A Verificar</TabsTrigger>
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
                         {visibleGroupTitles.map(title => (
                            <TabsTrigger key={title} value={title}>
                                {title} ({allGroupedItems[title].items.filter(item => (validationStatus[getItemLineKey(item)] || 'unvalidated') === activeFilter).length})
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {visibleGroupTitles.length > 0 ? (
                         <TabsContent key={activeTabGroup} value={activeTabGroup} className='mt-4'>
                             {(() => {
                                 const title = activeTabGroup;
                                 if (!title) return null;
                                 const description = cfopDescriptions[parseInt(title, 10) as keyof typeof cfopDescriptions] || "Descrição não encontrada";
                                return (
                                    <>
                                         <div className='mb-4 p-3 border rounded-md bg-muted/50 flex justify-between items-center'>
                                            <h3 className="text-lg font-semibold">CFOP (Sienge) {title}: <span className="font-normal">{description}</span></h3>
                                             <Button variant="outline" onClick={() => openCfopFilterModal(title)} size="icon" title="Filtrar por CFOP do XML nesta aba"><Settings className="h-4 w-4" /></Button>
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
                             <Button size="sm" variant="outline" onClick={() => handleBulkClassification('unvalidated')}><RotateCcw className="mr-2 h-4 w-4" /> Reverter</Button>
                         </div>
                    </Card>
                </div>
            )}
             
             {currentEditingCfopGroup && (
                <Dialog open={isCfopModalOpen} onOpenChange={setIsCfopModalOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Filtrar CFOPs do XML para o Grupo {currentEditingCfopGroup}</DialogTitle>
                            <DialogDescription>
                                Desmarque os CFOPs do XML que deseja ocultar da visualização deste grupo.
                            </DialogDescription>
                        </DialogHeader>
                        <ScrollArea className="h-96 w-full rounded-md border p-4">
                            {(allGroupedItems[currentEditingCfopGroup]?.xmlCfops || new Set()).size > 0 ? (
                                Array.from(allGroupedItems[currentEditingCfopGroup].xmlCfops).sort().map(cfop => (
                                    <div key={cfop} className="flex items-center justify-between p-2 rounded-md hover:bg-muted">
                                        <div className='flex items-center space-x-2'>
                                            <Checkbox
                                                id={`cfop-filter-${cfop}`}
                                                checked={tempIncludedXmlCfops.has(cfop)}
                                                onCheckedChange={(checked) => handleCfopFilterToggle(cfop, !!checked)}
                                            />
                                            <Label htmlFor={`cfop-filter-${cfop}`} className="flex flex-col">
                                                <Badge variant="secondary">{cfop}</Badge>
                                                <span className="ml-2 text-xs text-muted-foreground">{cfopDescriptions[parseInt(cfop, 10) as keyof typeof cfopDescriptions] || "Descrição não encontrada"}</span>
                                            </Label>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-muted-foreground text-center">Nenhum CFOP do XML encontrado neste grupo.</p>
                            )}
                        </ScrollArea>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsCfopModalOpen(false)}>Cancelar</Button>
                            <Button onClick={handleSaveCfopFilter}>Guardar Filtro</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
             )}
        </div>
    );
}
