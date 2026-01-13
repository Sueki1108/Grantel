
"use client";

import { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/components/app/columns-helper";
import { Building, Download, List, Factory, Wrench, HardHat, RotateCw, Settings2, Copy, HelpCircle, Tag, ListFilter, Save } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';
import {
    Tooltip,
    TooltipProvider,
    TooltipTrigger,
    TooltipContent,
} from "@/components/ui/tooltip";
import { RowSelectionState, Table as ReactTable } from '@tanstack/react-table';
import * as React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { SupplierCategoryDialog } from './supplier-category-dialog';
import { cn, cleanAndToStr, normalizeKey } from '@/lib/utils';
import type { AllClassifications, Classification, SupplierCategory } from '@/lib/types';
import { Input } from '../ui/input';
import * as LucideIcons from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { ScrollArea } from '../ui/scroll-area';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { cfopDescriptions } from '@/lib/cfop';


interface ImobilizadoAnalysisProps {
    items: any[]; 
    siengeData: any[] | null;
    competence: string | null; 
    onPersistData: (allData: AllClassifications) => void;
    allPersistedData: AllClassifications;
    reconciliationResults?: any; // Para enriquecer com Contabilização e Centro de Custo
}

interface ClassificationTableProps {
    data: any[];
    columns: any[];
    rowSelection: RowSelectionState;
    setRowSelection: React.Dispatch<React.SetStateAction<RowSelectionState>>;
    tableRef: React.MutableRefObject<ReactTable<any> | null>;
}

const CFOP_FILTER_STORAGE_KEY = 'imobilizadoCfopFilter';


const ClassificationTable: React.FC<ClassificationTableProps> = ({ 
    data, 
    columns,
    rowSelection, 
    setRowSelection, 
    tableRef, 
}) => {

    if (!data || data.length === 0) {
        return <div className="text-center text-muted-foreground p-8">Nenhum item nesta categoria.</div>;
    }

    return <DataTable columns={columns} data={data} rowSelection={rowSelection} setRowSelection={setRowSelection} tableRef={tableRef} onSelectionChange={() => {}} />;
}


export function ImobilizadoAnalysis({ items: initialAllItems, siengeData, competence, onPersistData, allPersistedData, reconciliationResults }: ImobilizadoAnalysisProps) {
    const { toast } = useToast();
    
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState<Classification>('unclassified');
    const [cfopFilter, setCfopFilter] = useState<Set<string>>(new Set());
    const [contabilizacaoFilter, setContabilizacaoFilter] = useState<Set<string>>(new Set());
    const [centroCustoFilter, setCentroCustoFilter] = useState<Set<string>>(new Set());
    const [fornecedorFilter, setFornecedorFilter] = useState<Set<string>>(new Set());
    const [isCfopModalOpen, setIsCfopModalOpen] = useState(false);
    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
    const [enrichedItems, setEnrichedItems] = useState<any[]>([]);

    useEffect(() => {
        if (!initialAllItems) {
            setEnrichedItems([]);
            return;
        }

        const findSiengeHeader = (possibleNames: string[]): string | undefined => {
            if (!siengeData || siengeData.length === 0 || !siengeData[0]) return undefined;
            const headers = Object.keys(siengeData[0]);
            return headers.find(h => possibleNames.some(p => normalizeKey(h) === normalizeKey(p)));
        };

        const hSienge = {
            numero: findSiengeHeader(['documento', 'número', 'numero', 'numero da nota', 'nota fiscal']),
            cpfCnpj: findSiengeHeader(['cpf/cnpj', 'cpf/cnpj do fornecedor', 'cpfcnpj']),
            cfop: findSiengeHeader(['cfop']),
            produtoFiscal: findSiengeHeader(['produto fiscal', 'descrição do item', 'descrição']),
        };

        const siengeItemMap = new Map<string, any[]>();
        if (siengeData && hSienge.numero && hSienge.cpfCnpj) {
            siengeData.forEach(sItem => {
                const docNumber = sItem[hSienge.numero!];
                const credorCnpj = sItem[hSienge.cpfCnpj!];
                if (docNumber && credorCnpj) {
                    const key = `${cleanAndToStr(docNumber)}-${cleanAndToStr(credorCnpj)}`;
                    if (!siengeItemMap.has(key)) {
                         siengeItemMap.set(key, []);
                    }
                    siengeItemMap.get(key)!.push(sItem);
                }
            });
        }
        
        const newItems = initialAllItems.map(item => {
            const emitenteCnpj = item['CPF/CNPJ do Emitente'] || '';
            const codigoProduto = item['Código'] || '';
            const numeroNota = item['Número da Nota'] || '';

            const comparisonKey = `${cleanAndToStr(numeroNota)}-${cleanAndToStr(emitenteCnpj)}`;
            const siengeMatches = siengeItemMap.get(comparisonKey) || [];

            let siengeCfopValue = 'N/A';
            if (siengeMatches.length > 0 && hSienge.cfop && hSienge.produtoFiscal) {
                const siengeMatch = siengeMatches.find(si => {
                    const xmlProdCode = cleanAndToStr(item['Código']);
                    const siengeProdCode = cleanAndToStr(String(si[hSienge.produtoFiscal!]).split('-')[0]);
                    return xmlProdCode === siengeProdCode;
                }) || siengeMatches[0];
                if (siengeMatch) {
                    siengeCfopValue = siengeMatch[hSienge.cfop!] || 'N/A';
                }
            }
            
            // Enriquecer com dados da conciliação se disponível
            let contabilizacao = item['Contabilização'] || 'N/A';
            let centroCusto = item['Centro de Custo'] || 'N/A';
            
            // Se ainda for N/A, tenta buscar nos resultados da conciliação por Chave Única
            if ((contabilizacao === 'N/A' || centroCusto === 'N/A') && reconciliationResults?.reconciled) {
                const reconciledItem = reconciliationResults.reconciled.find((ri: any) => {
                    const itemChaveUnica = item['Chave Unica'] || '';
                    const itemItem = item['Item'] || '';
                    const riChaveUnica = ri['Chave Unica'] || '';
                    const riItem = ri['Item'] || '';
                    
                    if (itemChaveUnica && riChaveUnica && itemChaveUnica === riChaveUnica) {
                        return itemItem && riItem ? String(itemItem) === String(riItem) : true;
                    }
                    return false;
                });

                if (reconciledItem) {
                    if (contabilizacao === 'N/A') contabilizacao = reconciledItem['Contabilização'] || 'N/A';
                    if (centroCusto === 'N/A') centroCusto = reconciledItem['Centro de Custo'] || 'N/A';
                }
            }
            
            return {
                ...item,
                'CFOP (Sienge)': siengeCfopValue,
                'Contabilização': contabilizacao,
                'Centro de Custo': centroCusto,
            };
        });
        setEnrichedItems(newItems);
    }, [initialAllItems, siengeData, reconciliationResults]);


    const handlePersistClassifications = (competence: string, classifications: { [uniqueItemId: string]: { classification: Classification } }) => {
        const updatedData = { ...allPersistedData };
        if (!updatedData[competence]) {
            updatedData[competence] = { classifications: {}, accountCodes: {}, cfopValidations: { classifications: {} }, difalValidations: { classifications: {}}, supplierClassifications: {} };
        }
        if (!updatedData[competence].classifications) {
            updatedData[competence].classifications = {};
        }

        Object.keys(classifications).forEach(key => {
            updatedData[competence].classifications[key] = classifications[key];
        });
        onPersistData(updatedData);
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
    

    const handleClassificationChange = (itemsToUpdate: any[], newClassification: Classification) => {
        if (!competence) return;
        
        const classificationsToUpdate: { [uniqueItemId: string]: { classification: Classification } } = {};
        itemsToUpdate.forEach(item => {
            classificationsToUpdate[item.uniqueItemId] = { classification: newClassification };
        });

        handlePersistClassifications(competence, classificationsToUpdate);
        toast({ title: "Classificação atualizada!" });
    };

    const handleBulkClassification = (newClassification: Classification) => {
        const table = tableRef.current;
        if (!table) return;

        const selectedItems = table.getFilteredSelectedRowModel().rows.map(row => row.original as any);
        handleClassificationChange(selectedItems, newClassification);
        setRowSelection({}); 
    };

    
    const handleAccountCodeChange = (itemLineId: string, code: string) => {
        if (!competence) return;

        const updatedPersistedData = JSON.parse(JSON.stringify(allPersistedData));
        if (!updatedPersistedData[competence]) updatedPersistedData[competence] = { classifications: {}, accountCodes: {}, cfopValidations: { classifications: {} }, difalValidations: { classifications: {}}, supplierClassifications: {} };
        if (!updatedPersistedData[competence].accountCodes) updatedPersistedData[competence].accountCodes = {};

        updatedPersistedData[competence].accountCodes[itemLineId] = { accountCode: code };

        onPersistData(updatedPersistedData);
    };


    const allCfops = useMemo(() => {
        const cfops = new Set<string>();
        enrichedItems.forEach(item => {
            if (item['CFOP'] && item['CFOP'] !== 'N/A') {
                cfops.add(String(item['CFOP']));
            }
        });
        return Array.from(cfops).sort();
    }, [enrichedItems]);

    const allContabilizacoes = useMemo(() => {
        const contabilizacoes = new Set<string>();
        enrichedItems.forEach(item => {
            const contabilizacao = item['Contabilização'] || 'N/A';
            contabilizacoes.add(String(contabilizacao));
        });
        return Array.from(contabilizacoes).sort();
    }, [enrichedItems]);

    const allCentrosCusto = useMemo(() => {
        const centrosCusto = new Set<string>();
        enrichedItems.forEach(item => {
            const centroCusto = item['Centro de Custo'] || 'N/A';
            centrosCusto.add(String(centroCusto));
        });
        return Array.from(centrosCusto).sort();
    }, [enrichedItems]);

    const allFornecedores = useMemo(() => {
        const fornecedores = new Set<string>();
        enrichedItems.forEach(item => {
            const fornecedor = item['Fornecedor'] || 'N/A';
            if (fornecedor && fornecedor !== 'N/A') {
                fornecedores.add(String(fornecedor));
            }
        });
        return Array.from(fornecedores).sort();
    }, [enrichedItems]);
    
    useEffect(() => {
        try {
            const savedFilter = localStorage.getItem(CFOP_FILTER_STORAGE_KEY);
            if (savedFilter) {
                setCfopFilter(new Set(JSON.parse(savedFilter)));
            } else {
                setCfopFilter(new Set(allCfops));
            }
        } catch(e) {
            console.error("Failed to load CFOP filter from storage:", e);
            setCfopFilter(new Set(allCfops));
        }
    }, [allCfops]);

    useEffect(() => {
        if (contabilizacaoFilter.size === 0 && allContabilizacoes.length > 0) {
            setContabilizacaoFilter(new Set(allContabilizacoes));
        }
    }, [allContabilizacoes]);

    useEffect(() => {
        if (centroCustoFilter.size === 0 && allCentrosCusto.length > 0) {
            setCentroCustoFilter(new Set(allCentrosCusto));
        }
    }, [allCentrosCusto]);

    useEffect(() => {
        if (fornecedorFilter.size === 0 && allFornecedores.length > 0) {
            setFornecedorFilter(new Set(allFornecedores));
        }
    }, [allFornecedores]);

    const handleSaveCfopFilter = () => {
        try {
            localStorage.setItem(CFOP_FILTER_STORAGE_KEY, JSON.stringify(Array.from(cfopFilter)));
            toast({title: 'Filtro Guardado', description: 'A sua seleção de CFOPs foi guardada para futuras sessões.'});
            setIsCfopModalOpen(false);
        } catch(e) {
            console.error("Failed to save CFOP filter to storage:", e);
            toast({title: 'Erro ao Guardar', variant: 'destructive'});
        }
    };

    const handleCfopFilterChange = (cfop: string, checked: boolean) => {
        setCfopFilter(prev => {
            const newSet = new Set(prev);
            if (checked) {
                newSet.add(cfop);
            } else {
                newSet.delete(cfop);
            }
            return newSet;
        });
    };

    const filteredItems = useMemo(() => {
        const categories: Record<Classification, any[]> = {
            unclassified: [], imobilizado: [], 'uso-consumo': [], 'utilizado-em-obra': [], verify: []
        };
        
        const persistedForCompetence = (competence && allPersistedData[competence]?.classifications) || {};

        const itemsToProcess = enrichedItems.filter(item => {
            // Filtro por CFOP
            if (cfopFilter.size > 0 && !cfopFilter.has(String(item['CFOP']))) {
                return false;
            }
            // Filtro por Contabilização
            if (contabilizacaoFilter.size > 0 && !contabilizacaoFilter.has(String(item['Contabilização'] || 'N/A'))) {
                return false;
            }
            // Filtro por Centro de Custo
            if (centroCustoFilter.size > 0 && !centroCustoFilter.has(String(item['Centro de Custo'] || 'N/A'))) {
                return false;
            }
            // Filtro por Fornecedor
            if (fornecedorFilter.size > 0 && !fornecedorFilter.has(String(item['Fornecedor'] || 'N/A'))) {
                return false;
            }
            return true;
        });

        itemsToProcess.forEach(item => {
            let classification: Classification = 'unclassified';
            const persistedClassification = persistedForCompetence[item.uniqueItemId]?.classification;

            if (persistedClassification) {
                classification = persistedClassification;
            }
            
            categories[classification].push(item);
        });
        
        return categories;
    }, [enrichedItems, competence, allPersistedData, cfopFilter, contabilizacaoFilter, centroCustoFilter, fornecedorFilter]);
    
    const handleDownload = (data: any[], classification: Classification) => {
        if (data.length === 0) {
            toast({ title: 'Nenhum dado para exportar', variant: 'destructive' });
            return;
        }
        
        const persistedAccountCodes = (competence && allPersistedData[competence]?.accountCodes) || {};

        const dataToExport = data.map(item => {
             const accountCode = persistedAccountCodes[item.id]?.accountCode || '';
            return {
                'Número da Nota': item['Número da Nota'],
                'Descrição': item['Descrição'],
                'CFOP (XML)': item['CFOP'],
                'CFOP (Sienge)': item['CFOP (Sienge)'],
                'Descricao CFOP': (item['Descricao CFOP'] || '').substring(0, 20),
                'Valor Unitário': item['Valor Unitário'],
                'Valor Total': item['Valor Total'],
                'Código do Ativo': classification === 'imobilizado' ? accountCode : '',
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, `Classificação`);
        XLSX.writeFile(workbook, `Grantel - Imobilizado - ${classification}.xlsx`);
        toast({ title: 'Download Iniciado' });
    };

    const tableRef = React.useRef<ReactTable<any> | null>(null);
    
    const columns = useMemo(() => {
        const copyToClipboard = (text: string | number, type: string) => {
            const textToCopy = String(text);
            navigator.clipboard.writeText(textToCopy).then(() => {
                toast({ title: `${type} copiad${type.endsWith('a') ? 'a' : 'o'}`, description: textToCopy });
            }).catch(() => {
                toast({ variant: 'destructive', title: `Falha ao copiar ${type}` });
            });
        };
        const persistedAccountCodes = (competence && allPersistedData[competence]?.accountCodes) || {};
        const supplierCategories = allPersistedData.supplierCategories || [];
        const supplierClassifications = (competence && allPersistedData[competence]?.supplierClassifications) || {};
    
        const renderCellWithCopy = (displayValue: React.ReactNode, copyValue: string | number, typeName: string) => (
            <div className="flex items-center justify-between gap-1 group">
                <span className="truncate">{displayValue}</span>
                <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); copyToClipboard(copyValue, typeName); }}><Copy className="h-3 w-3" /></Button>
            </div>
        );
    
        const columnsToShow = ['Fornecedor', 'Número da Nota', 'Descrição', 'CFOP', 'CFOP (Sienge)', 'CST do ICMS', 'Valor Unitário', 'Valor Total', 'Contabilização', 'Centro de Custo'];
    
        const baseColumns = getColumnsWithCustomRender(
            enrichedItems,
            columnsToShow,
            (row, id) => {
                const item = row.original;
                const value = item[id];
                const supplierCnpj = item['CPF/CNPJ do Emitente'];
                const supplierClassificationId = supplierClassifications[supplierCnpj];
                const supplierCategory = supplierCategories.find(c => c.id === supplierClassificationId);
                
                const isIncorrectCfop = supplierCategory && supplierCategory.allowedCfops.length > 0 && !supplierCategory.allowedCfops.includes(String(item['CFOP (Sienge)']));

                if (id === 'Fornecedor') {
                    const LucideIcon = supplierCategory?.icon ? (LucideIcons[supplierCategory.icon as keyof typeof LucideIcons] as React.ElementType) : Tag;
                    return (
                        <div className={cn("flex items-center gap-2 group/row", isIncorrectCfop && "text-red-500")}>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <button onClick={(e) => e.stopPropagation()} className="transition-opacity">
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <LucideIcon className={cn("h-4 w-4", supplierCategory ? "text-primary" : "text-muted-foreground")} />
                                                </TooltipTrigger>
                                                <TooltipContent><p>{supplierCategory?.name || "Sem categoria"}</p></TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-2" onClick={(e) => e.stopPropagation()}>
                                     <div className="grid grid-cols-5 gap-1">
                                        {supplierCategories.map(cat => {
                                            const CatIcon = LucideIcons[cat.icon as keyof typeof LucideIcons] || Tag;
                                            return (
                                                <TooltipProvider key={cat.id}><Tooltip>
                                                    <TooltipTrigger asChild>
                                                         <Button variant={supplierClassificationId === cat.id ? "default" : "outline"} size="icon" className="h-9 w-9" onClick={() => handleSupplierCategoryChange(supplierCnpj, cat.id)}><CatIcon className="h-4 w-4" /></Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent><p>{cat.name}</p></TooltipContent>
                                                </Tooltip></TooltipProvider>
                                            )
                                        })}
                                    </div>
                                    <hr className="my-2"/>
                                    <Button variant="ghost" size="sm" className="w-full justify-start text-red-500 hover:text-red-500 hover:bg-red-50" onClick={() => handleSupplierCategoryChange(supplierCnpj, null)}>Remover Classificação</Button>
                                </PopoverContent>
                            </Popover>
                            {renderCellWithCopy(value, value, 'Fornecedor')}
                        </div>
                    );
                }

                if ((id === 'Valor Total' || id === 'Valor Unitário') && typeof value === 'number') {
                    return <div className="text-right">{value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>;
                }

                const summarizedValue = typeof value === 'string' && value.length > 35 ? `${value.substring(0, 35)}...` : value;
    
                if (id === 'Descrição' || id === 'Número da Nota') {
                    return renderCellWithCopy(
                        <TooltipProvider><Tooltip><TooltipTrigger asChild><span>{summarizedValue}</span></TooltipTrigger><TooltipContent><p>{value}</p></TooltipContent></Tooltip></TooltipProvider>,
                        value,
                        id
                    );
                }
                
                return <div className={cn("truncate max-w-xs", isIncorrectCfop && "text-red-500", value === null || value === undefined ? 'text-muted-foreground' : '')}>{String(value ?? 'N/A')}</div>;
            }
        );
    
        if (activeTab === 'imobilizado') {
            baseColumns.push({
                id: 'accountCode',
                header: 'Código do Ativo',
                cell: ({ row }: any) => {
                    const item = row.original as any;
                    return (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <Input
                                placeholder="Ex: 1.2.3.01.0001"
                                defaultValue={persistedAccountCodes[item.id]?.accountCode || ''}
                                onBlur={(e) => handleAccountCodeChange(item.id, e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                className="h-8"
                            />
                        </div>
                    );
                }
            });
        }
    
        baseColumns.push({
            id: 'actions',
            header: 'Ações Individuais',
            cell: ({ row }: any) => {
                const originalItem = row.original as any;
                const currentClassification = activeTab;
    
                return (
                     <TooltipProvider>
                        <div className="flex gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
                            {currentClassification !== 'imobilizado' && (
                                <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleClassificationChange([originalItem], 'imobilizado')}><Factory className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Classificar como Imobilizado</p></TooltipContent></Tooltip>
                            )}
                            {currentClassification !== 'uso-consumo' && (
                                <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleClassificationChange([originalItem], 'uso-consumo')}><Wrench className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Classificar como Uso e Consumo</p></TooltipContent></Tooltip>
                            )}
                            {currentClassification !== 'utilizado-em-obra' && (
                                <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleClassificationChange([originalItem], 'utilizado-em-obra')}><HardHat className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Classificar como Utilizado em Obra</p></TooltipContent></Tooltip>
                            )}
                             {currentClassification !== 'verify' && (
                                <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleClassificationChange([originalItem], 'verify')}><HelpCircle className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Marcar para Verificar</p></TooltipContent></Tooltip>
                            )}
                            {currentClassification !== 'unclassified' && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleClassificationChange([originalItem], 'unclassified')}>
                                            <RotateCw className="h-5 w-5 text-destructive" />
                                        </Button>
                                    </TooltipTrigger><TooltipContent><p>Reverter para Não Classificado</p></TooltipContent>
                                </Tooltip>
                            )}
                        </div>
                    </TooltipProvider>
                );
            }
        });
    
        return baseColumns;
    }, [enrichedItems, activeTab, allPersistedData, competence, toast]);

    if (!initialAllItems || initialAllItems.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3"><Building className="h-8 w-8 text-primary" /><div><CardTitle className="font-headline text-2xl">Análise de Imobilizado</CardTitle><CardDescription>Classifique itens relevantes para imobilizado, despesa ou consumo.</CardDescription></div></div>
                </CardHeader>
                <CardContent className="p-8 text-center text-muted-foreground"><Building className="mx-auto h-12 w-12 mb-4" /><h3 className="text-xl font-semibold mb-2">Aguardando dados</h3><p>Execute a "Validação de Documentos" na primeira aba para carregar os itens para análise.</p></CardContent>
            </Card>
        );
    }

    if (!competence) {
         return (
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3"><Building className="h-8 w-8 text-primary" /><div><CardTitle className="font-headline text-2xl">Análise de Imobilizado</CardTitle><CardDescription>Classifique itens relevantes para imobilizado, despesa ou consumo.</CardDescription></div></div>
                </CardHeader>
                <CardContent className="p-8 text-center text-muted-foreground"><Building className="mx-auto h-12 w-12 mb-4" /><h3 className="text-xl font-semibold mb-2">Aguardando Competência</h3><p>Execute a "Validação de Documentos" e selecione um período para iniciar a classificação.</p></CardContent>
            </Card>
        );
    }

    const numSelected = Object.keys(rowSelection).length;

    return (
        <div className='relative' ref={containerRef}>
             {numSelected > 0 && (
                <div className="sticky bottom-4 z-20 w-full flex justify-center">
                    <Card className="flex items-center gap-4 p-3 shadow-2xl animate-in fade-in-0 slide-in-from-bottom-5">
                         <span className="text-sm font-medium pl-2">{numSelected} item(ns) selecionado(s)</span>
                        <div className="h-6 border-l" />
                         <span className="text-sm font-medium">Classificar como:</span>
                         <div className="flex gap-2">
                             <Button size="sm" onClick={() => handleBulkClassification('imobilizado')}><Factory className="mr-2 h-4 w-4" /> Imobilizado</Button>
                             <Button size="sm" variant="secondary" onClick={() => handleBulkClassification('uso-consumo')}><Wrench className="mr-2 h-4 w-4" /> Uso e Consumo</Button>
                             <Button size="sm" variant="secondary" onClick={() => handleBulkClassification('utilizado-em-obra')}><HardHat className="mr-2 h-4 w-4" /> Utilizado em Obra</Button>
                             <Button size="sm" variant="secondary" onClick={() => handleBulkClassification('verify')}><HelpCircle className="mr-2 h-4 w-4" /> Verificar</Button>
                              <Button size="sm" variant="outline" onClick={() => handleBulkClassification('unclassified')}><RotateCw className="mr-2 h-4 w-4" /> Reverter</Button>
                         </div>
                    </Card>
                </div>
            )}
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <Building className="h-8 w-8 text-primary" />
                            <div>
                                <CardTitle className="font-headline text-2xl">Análise de Imobilizado (Competência: {competence})</CardTitle>
                                <CardDescription>Classifique os itens. Clique nas linhas para selecionar múltiplos itens e use a barra de ações. Suas escolhas serão guardadas automaticamente.</CardDescription>
                            </div>
                        </div>
                         <div className='flex items-center gap-2'>
                           <SupplierCategoryDialog 
                                categories={allPersistedData.supplierCategories || []} 
                                onSave={handleSaveSupplierCategories}
                            />
                            <Dialog open={isFilterModalOpen} onOpenChange={setIsFilterModalOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        <ListFilter className="mr-2 h-4 w-4" />Filtros Avançados
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-4xl">
                                    <DialogHeader>
                                        <DialogTitle>Filtros Avançados</DialogTitle>
                                        <DialogDescription>Selecione os filtros que deseja aplicar. Se nada for selecionado, todos serão exibidos.</DialogDescription>
                                    </DialogHeader>
                                    <Tabs defaultValue="cfop" className="w-full">
                                        <TabsList className="grid w-full grid-cols-4">
                                            <TabsTrigger value="cfop">CFOP</TabsTrigger>
                                            <TabsTrigger value="contabilizacao">Contabilização</TabsTrigger>
                                            <TabsTrigger value="centroCusto">Centro de Custo</TabsTrigger>
                                            <TabsTrigger value="fornecedor">Fornecedor</TabsTrigger>
                                        </TabsList>
                                        <TabsContent value="cfop" className="mt-4">
                                            <div className="flex gap-2 mb-2">
                                                <Button size="sm" variant="secondary" onClick={() => setCfopFilter(new Set(allCfops))}>Marcar Todos</Button>
                                                <Button size="sm" variant="secondary" onClick={() => setCfopFilter(new Set())}>Limpar Seleção</Button>
                                            </div>
                                            <ScrollArea className='h-[60vh] border rounded-md p-4'>
                                                <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2'>
                                                    {allCfops.map(cfop => (
                                                        <div key={cfop} className="flex items-start space-x-2">
                                                            <Checkbox
                                                                id={`cfop-filter-${cfop}`}
                                                                checked={cfopFilter.has(cfop)}
                                                                onCheckedChange={(checked) => handleCfopFilterChange(cfop, !!checked)}
                                                            />
                                                            <Label htmlFor={`cfop-filter-${cfop}`} className="text-sm font-normal cursor-pointer">
                                                                {cfop}: {(cfopDescriptions[parseInt(cfop, 10)] || "Descrição não encontrada")}
                                                            </Label>
                                                        </div>
                                                    ))}
                                                </div>
                                            </ScrollArea>
                                        </TabsContent>
                                        <TabsContent value="contabilizacao" className="mt-4">
                                            <div className="flex gap-2 mb-2">
                                                <Button size="sm" variant="secondary" onClick={() => setContabilizacaoFilter(new Set(allContabilizacoes))}>Marcar Todos</Button>
                                                <Button size="sm" variant="secondary" onClick={() => setContabilizacaoFilter(new Set())}>Limpar Seleção</Button>
                                            </div>
                                            <ScrollArea className='h-[60vh] border rounded-md p-4'>
                                                {allContabilizacoes.map(contabilizacao => (
                                                    <div key={contabilizacao} className="flex items-start space-x-2 mb-2">
                                                        <Checkbox
                                                            id={`contabilizacao-filter-${contabilizacao}`}
                                                            checked={contabilizacaoFilter.has(contabilizacao)}
                                                            onCheckedChange={(checked) => {
                                                                setContabilizacaoFilter(prev => {
                                                                    const newSet = new Set(prev);
                                                                    if (checked) newSet.add(contabilizacao);
                                                                    else newSet.delete(contabilizacao);
                                                                    return newSet;
                                                                });
                                                            }}
                                                        />
                                                        <Label htmlFor={`contabilizacao-filter-${contabilizacao}`} className="text-sm font-normal cursor-pointer">
                                                            {contabilizacao}
                                                        </Label>
                                                    </div>
                                                ))}
                                            </ScrollArea>
                                        </TabsContent>
                                        <TabsContent value="centroCusto" className="mt-4">
                                            <div className="flex gap-2 mb-2">
                                                <Button size="sm" variant="secondary" onClick={() => setCentroCustoFilter(new Set(allCentrosCusto))}>Marcar Todos</Button>
                                                <Button size="sm" variant="secondary" onClick={() => setCentroCustoFilter(new Set())}>Limpar Seleção</Button>
                                            </div>
                                            <ScrollArea className='h-[60vh] border rounded-md p-4'>
                                                {allCentrosCusto.map(centroCusto => (
                                                    <div key={centroCusto} className="flex items-start space-x-2 mb-2">
                                                        <Checkbox
                                                            id={`centroCusto-filter-${centroCusto}`}
                                                            checked={centroCustoFilter.has(centroCusto)}
                                                            onCheckedChange={(checked) => {
                                                                setCentroCustoFilter(prev => {
                                                                    const newSet = new Set(prev);
                                                                    if (checked) newSet.add(centroCusto);
                                                                    else newSet.delete(centroCusto);
                                                                    return newSet;
                                                                });
                                                            }}
                                                        />
                                                        <Label htmlFor={`centroCusto-filter-${centroCusto}`} className="text-sm font-normal cursor-pointer">
                                                            {centroCusto}
                                                        </Label>
                                                    </div>
                                                ))}
                                            </ScrollArea>
                                        </TabsContent>
                                        <TabsContent value="fornecedor" className="mt-4">
                                            <div className="flex gap-2 mb-2">
                                                <Button size="sm" variant="secondary" onClick={() => setFornecedorFilter(new Set(allFornecedores))}>Marcar Todos</Button>
                                                <Button size="sm" variant="secondary" onClick={() => setFornecedorFilter(new Set())}>Limpar Seleção</Button>
                                            </div>
                                            <ScrollArea className='h-[60vh] border rounded-md p-4'>
                                                {allFornecedores.map(fornecedor => (
                                                    <div key={fornecedor} className="flex items-start space-x-2 mb-2">
                                                        <Checkbox
                                                            id={`fornecedor-filter-${fornecedor}`}
                                                            checked={fornecedorFilter.has(fornecedor)}
                                                            onCheckedChange={(checked) => {
                                                                setFornecedorFilter(prev => {
                                                                    const newSet = new Set(prev);
                                                                    if (checked) newSet.add(fornecedor);
                                                                    else newSet.delete(fornecedor);
                                                                    return newSet;
                                                                });
                                                            }}
                                                        />
                                                        <Label htmlFor={`fornecedor-filter-${fornecedor}`} className="text-sm font-normal cursor-pointer">
                                                            {fornecedor}
                                                        </Label>
                                                    </div>
                                                ))}
                                            </ScrollArea>
                                        </TabsContent>
                                    </Tabs>
                                    <DialogFooter>
                                         <Button variant="outline" onClick={() => setIsFilterModalOpen(false)}>Fechar</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <TooltipProvider>
                        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
                            <TabsList className="grid w-full grid-cols-5">
                                <TabsTrigger value="unclassified" className="flex gap-2"><List />Não Classificados ({filteredItems.unclassified.length})</TabsTrigger>
                                <TabsTrigger value="imobilizado" className="flex gap-2"><Factory />Imobilizado ({filteredItems.imobilizado.length})</TabsTrigger>
                                <TabsTrigger value="uso-consumo" className="flex gap-2"><Wrench />Uso e Consumo ({filteredItems['uso-consumo'].length})</TabsTrigger>
                                <TabsTrigger value="utilizado-em-obra" className="flex gap-2"><HardHat />Utilizado em Obra ({filteredItems['utilizado-em-obra'].length})</TabsTrigger>
                                <TabsTrigger value="verify" className="flex gap-2"><HelpCircle />A Verificar ({filteredItems.verify.length})</TabsTrigger>
                            </TabsList>
                            
                             <TabsContent value="unclassified" className="mt-6">
                                <ClassificationTable data={filteredItems.unclassified} columns={columns} {...{rowSelection, setRowSelection, tableRef}} />
                            </TabsContent>
                            <TabsContent value="imobilizado" className="mt-6">
                                <Button onClick={() => handleDownload(filteredItems.imobilizado, 'imobilizado')} className="mb-4"><Download className="mr-2 h-4 w-4" /> Baixar</Button>
                                <ClassificationTable data={filteredItems.imobilizado} columns={columns} {...{rowSelection, setRowSelection, tableRef}} />
                            </TabsContent>
                            <TabsContent value="uso-consumo" className="mt-6">
                                <Button onClick={() => handleDownload(filteredItems['uso-consumo'], 'uso-consumo')} className="mb-4"><Download className="mr-2 h-4 w-4" /> Baixar</Button>
                                <ClassificationTable data={filteredItems['uso-consumo']} columns={columns} {...{rowSelection, setRowSelection, tableRef}} />
                            </TabsContent>
                            <TabsContent value="utilizado-em-obra" className="mt-6">
                                <Button onClick={() => handleDownload(filteredItems['utilizado-em-obra'], 'utilizado-em-obra')} className="mb-4"><Download className="mr-2 h-4 w-4" /> Baixar</Button>
                                <ClassificationTable data={filteredItems['utilizado-em-obra']} columns={columns} {...{rowSelection, setRowSelection, tableRef}} />
                            </TabsContent>
                             <TabsContent value="verify" className="mt-6">
                                <Button onClick={() => handleDownload(filteredItems.verify, 'a-verificar')} className="mb-4"><Download className="mr-2 h-4 w-4" /> Baixar</Button>
                                <ClassificationTable data={filteredItems.verify} columns={columns} {...{rowSelection, setRowSelection, tableRef}} />
                            </TabsContent>
                        </Tabs>
                    </TooltipProvider>
                </CardContent>
            </Card>
        </div>
    );
}


    