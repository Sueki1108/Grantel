"use client";

import * as React from "react";
import { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/lib/columns-helper";
import { ThumbsDown, ThumbsUp, RotateCcw, AlertTriangle, CheckCircle, FileWarning, Search, ArrowUpDown, FilterX, Copy } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Badge } from '../ui/badge';
import type { AllClassifications } from './imobilizado-analysis';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { cfopDescriptions } from '@/lib/cfop';
import { RowSelectionState, Table as ReactTable } from '@tanstack/react-table';
import { Card } from '../ui/card';
import { Checkbox } from '../ui/checkbox';


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
  [cfop: string]: CfopValidationData[];
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


interface CfopValidatorProps {
    items: CfopValidationData[];
    allPersistedClassifications: AllClassifications;
    onPersistAllClassifications: (allData: AllClassifications) => void;
}

const getUniqueProductKey = (item: CfopValidationData): string => {
    return `${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}`;
};

export function CfopValidator({ items, allPersistedClassifications, onPersistAllClassifications }: CfopValidatorProps) {
    const { toast } = useToast();
    const [validationStatus, setValidationStatus] = useState<Record<string, ValidationStatus>>({});
    const [activeFilter, setActiveFilter] = useState<ValidationStatus | 'all'>('unvalidated');
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

    const reconciledItems = useMemo(() => items.filter(item => item && item.Observações?.startsWith('Conciliado')), [items]);


    // Carrega o estado persistido na inicialização
    useEffect(() => {
        const persistedValidations = (allPersistedClassifications && allPersistedClassifications['cfopValidations']?.classifications) || {};
        const initialStatus: Record<string, ValidationStatus> = {};

        reconciledItems.forEach(item => {
            const uniqueProductKey = getUniqueProductKey(item);
            initialStatus[item['Chave de acesso'] + item.Item] = persistedValidations[uniqueProductKey]?.classification as ValidationStatus || 'unvalidated';
        });

        setValidationStatus(initialStatus);
    }, [reconciledItems, allPersistedClassifications]);


     const handleValidationChange = (itemsToUpdate: CfopValidationData[], newStatus: ValidationStatus) => {
        const newValidationStatus = { ...validationStatus };
        const updatedPersistedData = JSON.parse(JSON.stringify(allPersistedClassifications || {}));
        if (!updatedPersistedData['cfopValidations']) {
            updatedPersistedData['cfopValidations'] = { classifications: {}, accountCodes: {} };
        }
        
        itemsToUpdate.forEach(item => {
            const itemKey = item['Chave de acesso'] + item.Item;
            newValidationStatus[itemKey] = newStatus;
            
            const uniqueProductKey = getUniqueProductKey(item);
             if (newStatus !== 'unvalidated') {
                updatedPersistedData['cfopValidations'].classifications[uniqueProductKey] = { classification: newStatus };
            } else {
                delete updatedPersistedData['cfopValidations'].classifications[uniqueProductKey];
            }
        });

        setValidationStatus(newValidationStatus);
        onPersistAllClassifications(updatedPersistedData);
        
        toast({
            title: `${itemsToUpdate.length} item(ns) classificado(s) como "${newStatus}"`,
            description: "A sua alteração foi guardada automaticamente."
        });
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


    // Colunas da Tabela
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

    const actionColumn: any = {
        id: 'Ações',
        header: 'Ações',
        cell: ({ row }: any) => {
            const item = row.original;
            const currentStatus = validationStatus[item['Chave de acesso'] + item.Item] || 'unvalidated';
            return (
                <TooltipProvider>
                    <div className="flex gap-2 justify-center" onClick={(e) => e.stopPropagation()}>
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant={currentStatus === 'correct' ? 'default' : 'ghost'} className="h-8 w-8" onClick={(e) => {e.stopPropagation(); handleValidationChange([item], 'correct')}}><ThumbsUp className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Marcar como Correto</p></TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant={currentStatus === 'incorrect' ? 'destructive' : 'ghost'} className="h-8 w-8" onClick={(e) => {e.stopPropagation(); handleValidationChange([item], 'incorrect')}}><ThumbsDown className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Marcar como Incorreto</p></TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button size="icon" variant={currentStatus === 'verify' ? 'secondary' : 'ghost'} className="h-8 w-8" onClick={(e) => {e.stopPropagation(); handleValidationChange([item], 'verify')}}><Search className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Marcar para Verificar</p></TooltipContent></Tooltip>
                        {currentStatus !== 'unvalidated' && (
                             <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => {e.stopPropagation(); handleValidationChange([item], 'unvalidated')}}><RotateCcw className="h-5 w-5 text-muted-foreground" /></Button></TooltipTrigger><TooltipContent><p>Reverter para Pendente</p></TooltipContent></Tooltip>
                        )}
                    </div>
                </TooltipProvider>
            );
        }
    };
    
    const statusColumn: any = {
        id: 'status',
        header: 'Status',
        cell: ({ row }: any) => {
            const currentStatus = validationStatus[row.original['Chave de acesso'] + row.original.Item] || 'unvalidated';
            switch(currentStatus) {
                case 'correct': return <Badge variant="default" className='bg-green-600 hover:bg-green-700'><CheckCircle className="h-4 w-4 mr-1" /> Correto</Badge>;
                case 'incorrect': return <Badge variant="destructive"><AlertTriangle className="h-4 w-4 mr-1" /> Incorreto</Badge>;
                 case 'verify': return <Badge variant="secondary" className='bg-amber-500 text-white hover:bg-amber-600'><Search className="h-4 w-4 mr-1" /> Verificar</Badge>;
                default: return <Badge variant="outline"><FileWarning className="h-4 w-4 mr-1" /> Pendente</Badge>;
            }
        }
    };
    
     const filteredAndGroupedItems = useMemo((): GroupedItems => {
        // First, filter items based on the active tab's status
        const filteredItems = activeFilter === 'all'
            ? reconciledItems
            : reconciledItems.filter(item => (validationStatus[item['Chave de acesso'] + item.Item] || 'unvalidated') === activeFilter);
        
        // Then, group the filtered items by CFOP
        const groups: GroupedItems = {};
        filteredItems.forEach(item => {
            const cfop = item.Sienge_CFOP;
            if (!groups[cfop]) {
                groups[cfop] = [];
            }
            groups[cfop].push(item);
        });

        return groups;
    }, [reconciledItems, validationStatus, activeFilter]);
    
    const [activeTabGroup, setActiveTabGroup] = useState<string>('');
    const tableRef = React.useRef<ReactTable<CfopValidationData> | null>(null);

    const fullColumns = useMemo(() => [ ...columns, statusColumn, actionColumn], [columns, validationStatus]);

    const sortedGroupTitles = useMemo(() => Object.keys(filteredAndGroupedItems).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)), [filteredAndGroupedItems]);

    useEffect(() => {
        if (sortedGroupTitles.length > 0 && !sortedGroupTitles.includes(activeTabGroup)) {
            setActiveTabGroup(sortedGroupTitles[0]);
        } else if (sortedGroupTitles.length === 0) {
            setActiveTabGroup('');
        }
    }, [sortedGroupTitles, activeTabGroup]);

    const numSelected = Object.keys(rowSelection).length;
    
    const handleClearFilters = () => {
        if (tableRef.current) {
            tableRef.current.resetColumnFilters();
            tableRef.current.setGlobalFilter('');
        }
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

    return (
        <div className="space-y-4 h-full flex flex-col relative">
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
            <div className='flex items-center gap-4'>
                <Tabs defaultValue="unvalidated" value={activeFilter} onValueChange={(value) => setActiveFilter(value as any)} className="w-full">
                    <TabsList className="grid w-full grid-cols-5">
                        <TabsTrigger value="all">Todos</TabsTrigger>
                        <TabsTrigger value="unvalidated">Pendentes</TabsTrigger>
                        <TabsTrigger value="correct">Corretos</TabsTrigger>
                        <TabsTrigger value="incorrect">Incorretos</TabsTrigger>
                        <TabsTrigger value="verify">A Verificar</TabsTrigger>
                    </TabsList>
                </Tabs>
                <Button variant="outline" onClick={handleClearFilters} className='shrink-0'>
                    <FilterX className="mr-2 h-4 w-4" />
                    Limpar Filtros
                </Button>
            </div>
             
             <div className="flex-grow overflow-y-auto">
                <Tabs value={activeTabGroup} onValueChange={setActiveTabGroup} className="w-full">
                    <TabsList className="h-auto flex-wrap justify-start">
                         {sortedGroupTitles.map(title => (
                            <TabsTrigger key={title} value={title}>
                                {title} ({filteredAndGroupedItems[title].length})
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {sortedGroupTitles.map(title => {
                         const description = cfopDescriptions[parseInt(title, 10) as keyof typeof cfopDescriptions] || "Descrição não encontrada";
                        return (
                            <TabsContent key={title} value={title} className='mt-4'>
                                 <div className='mb-4 p-3 border rounded-md bg-muted/50'>
                                    <h3 className="text-lg font-semibold">CFOP {title}: <span className="font-normal">{description}</span></h3>
                                </div>
                                <DataTable
                                    columns={fullColumns}
                                    data={filteredAndGroupedItems[title]}
                                    rowSelection={rowSelection}
                                    setRowSelection={setRowSelection}
                                    tableRef={tableRef}
                                />
                            </TabsContent>
                        )
                    })}
                </Tabs>
                
                {sortedGroupTitles.length === 0 && (
                     <div className="text-center p-8 text-muted-foreground">
                        <FileWarning className="mx-auto h-12 w-12 mb-4" />
                        <h3 className="text-xl font-semibold">Nenhum item encontrado</h3>
                        <p>Não há itens com o status "{activeFilter}" para exibir.</p>
                     </div>
                )}
            </div>
        </div>
    );
}
    
