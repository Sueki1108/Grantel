
"use client";

import { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/components/app/columns-helper";
import { Building, Download, List, Factory, Wrench, HardHat, RotateCw, Settings2, Copy, HelpCircle, Tag } from "lucide-react";
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
import { cn } from '@/lib/utils';
import type { AllClassifications, Classification, SupplierCategory, DifalStatus } from '@/lib/types';


interface ImobilizadoAnalysisProps {
    items: any[]; 
    siengeData: any[] | null;
    competence: string | null; 
    onPersistData: (allData: AllClassifications) => void;
    allPersistedData: AllClassifications;
}

interface ClassificationTableProps {
    data: any[];
    columns: any[];
    rowSelection: RowSelectionState;
    setRowSelection: React.Dispatch<React.SetStateAction<RowSelectionState>>;
    tableRef: React.MutableRefObject<ReactTable<any> | null>;
}


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


export function ImobilizadoAnalysis({ items: initialAllItems, siengeData, competence, onPersistData, allPersistedData }: ImobilizadoAnalysisProps) {
    const { toast } = useToast();
    
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState<Classification>('unclassified');
    const [isSupplierCategoryModalOpen, setIsSupplierCategoryModalOpen] = useState(false);


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
            updatedData[competence] = { classifications: {}, accountCodes: {}, supplierClassifications: {} };
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
        if (!updatedPersistedData[competence]) updatedPersistedData[competence] = { classifications: {}, accountCodes: {} };
        if (!updatedPersistedData[competence].accountCodes) updatedPersistedData[competence].accountCodes = {};

        updatedPersistedData[competence].accountCodes[itemLineId] = { accountCode: code };

        onPersistData(updatedPersistedData);
    };


    const imobilizadoItems = useMemo(() => {
        if (!initialAllItems) return [];
        return initialAllItems.map(item => {
            const emitenteCnpj = item['CPF/CNPJ do Emitente'] || '';
            const codigoProduto = item['Código'] || '';

            return {
                ...item,
                id: `${item['Chave Unica'] || ''}-${item['Item'] || ''}`,
                uniqueItemId: `${emitenteCnpj}-${codigoProduto}`,
                Fornecedor: item.Fornecedor || 'N/A',
                'CPF/CNPJ do Emitente': emitenteCnpj,
            };
        });
    }, [initialAllItems]);

    
    const filteredItems = useMemo(() => {
        const categories: Record<Classification, any[]> = {
            unclassified: [], imobilizado: [], 'uso-consumo': [], 'utilizado-em-obra': [], verify: []
        };
        
        const persistedForCompetence = (competence && allPersistedData[competence]?.classifications) || {};

        imobilizadoItems.forEach(item => {
            let classification: Classification = 'unclassified';
            const persistedClassification = persistedForCompetence[item.uniqueItemId]?.classification;

            if (persistedClassification) {
                classification = persistedClassification;
            }
            
            categories[classification].push(item);
        });
        
        return categories;
    }, [imobilizadoItems, competence, allPersistedData]);
    
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
                'CFOP': item['CFOP'],
                'Sienge_CFOP': item['Sienge_CFOP'],
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
    
        const columnsToShow = ['Fornecedor', 'Número da Nota', 'Descrição', 'CFOP', 'Alíq. ICMS (%)', 'Valor Unitário', 'Valor Total'];
    
        const baseColumns = getColumnsWithCustomRender(
            imobilizadoItems,
            columnsToShow,
            (row, id) => {
                const item = row.original;
                const value = item[id];
                const supplierCnpj = item['CPF/CNPJ do Emitente'];
                const supplierClassificationId = supplierClassifications[supplierCnpj];
                const supplierCategory = supplierCategories.find(c => c.id === supplierClassificationId);
                const isBlockedCfop = supplierCategory?.blockedCfops.includes(String(item.CFOP));

                if (id === 'Fornecedor') {
                    return (
                        <div className={cn("flex items-center gap-2 group/row", isBlockedCfop && "text-red-500")}>
                            {supplierCategory && <TooltipProvider><Tooltip><TooltipTrigger><Factory className="h-4 w-4" /></TooltipTrigger><TooltipContent><p>{supplierCategory.name}</p></TooltipContent></Tooltip></TooltipProvider>}
                            {renderCellWithCopy(value, value, 'Fornecedor')}
                            <Popover>
                                <PopoverTrigger asChild>
                                    <button onClick={(e) => e.stopPropagation()} className="opacity-0 group-hover/row:opacity-100 transition-opacity"><Tag className="h-4 w-4 text-muted-foreground" /></button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-2">
                                     <div className="space-y-1">
                                        {supplierCategories.map(cat => (
                                            <Button key={cat.id} variant="ghost" size="sm" className="w-full justify-start" onClick={() => handleSupplierCategoryChange(supplierCnpj, cat.id)}>{cat.name}</Button>
                                        ))}
                                        <hr className="my-1"/>
                                        <Button variant="destructive" size="sm" className="w-full justify-start" onClick={() => handleSupplierCategoryChange(supplierCnpj, null)}>Remover Classificação</Button>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    );
                }

                if ((id === 'Valor Total' || id === 'Valor Unitário') && typeof value === 'number') {
                    return <div className="text-right">{value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>;
                }
                if (id === 'Alíq. ICMS (%)') {
                    return <div className='text-center'>{typeof value === 'number' ? `${value.toFixed(2)}%` : 'N/A'}</div>;
                }

                const summarizedValue = typeof value === 'string' && value.length > 35 ? `${value.substring(0, 35)}...` : value;
    
                if (id === 'Descrição' || id === 'Número da Nota') {
                    return renderCellWithCopy(
                        <TooltipProvider><Tooltip><TooltipTrigger asChild><span>{summarizedValue}</span></TooltipTrigger><TooltipContent><p>{value}</p></TooltipContent></Tooltip></TooltipProvider>,
                        value,
                        id
                    );
                }
                
                return <div className={cn("truncate max-w-xs", isBlockedCfop && "text-red-500")}>{String(value ?? '')}</div>;
            }
        );
    
        baseColumns.unshift({
            id: 'select',
            header: ({ table }) => (
                <Checkbox
                    checked={table.getIsAllPageRowsSelected()}
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
    }, [imobilizadoItems, activeTab, allPersistedData, competence, toast]);


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
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <TooltipProvider>
                        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as Classification)} className="w-full">
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

    