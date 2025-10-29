"use client";

import { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/lib/columns-helper";
import { Building, Download, List, Factory, Wrench, HardHat, RotateCcw, Save } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { RowSelectionState } from '@tanstack/react-table';
import { Checkbox } from '../ui/checkbox';
import * as React from 'react';


// Tipos
export type Classification = 'unclassified' | 'imobilizado' | 'uso-consumo' | 'utilizado-em-obra';

export interface ItemData extends Record<string, any> {
    id: string; // Chave Única da Nota + N° do Item. Identificador único por linha.
    uniqueItemId: string; // Chave para persistência de CLASSIFICAÇÃO (CNPJ-CodigoProduto)
}

export interface ClassificationStorage {
    classification: Classification;
}

export interface AccountCodeStorage {
    [itemLineId: string]: { // A chave é o 'id' do item (único por linha)
        accountCode?: string;
    };
}

// Estrutura geral para guardar as classificações e os códigos
export interface AllClassifications {
    [competence: string]: {
        classifications: { [uniqueItemId: string]: ClassificationStorage };
        accountCodes: AccountCodeStorage;
        cfopValidations?: {
             classifications: {
                [uniqueProductKey: string]: {
                    classification: 'correct' | 'incorrect' | 'verify';
                }
            }
        }
    };
}


interface ImobilizadoAnalysisProps {
    items: ItemData[];
    competence: string | null; // ex: "2023-01_2023-02"
    onPersistData: (allDataToSave: AllClassifications) => void;
    allPersistedData: AllClassifications;
}

export function ImobilizadoAnalysis({ items: initialItems, competence, onPersistData, allPersistedData }: ImobilizadoAnalysisProps) {
    const { toast } = useToast();
    
    const [sessionClassifications, setSessionClassifications] = useState<Record<string, Classification>>({});
    const [sessionAccountCodes, setSessionAccountCodes] = useState<Record<string, string>>({});
    const [hasChanges, setHasChanges] = useState(false);
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const containerRef = React.useRef<HTMLDivElement>(null);


    useEffect(() => {
        if (!competence) return;
        
        const initialClassifications: Record<string, Classification> = {};
        const initialCodes: Record<string, string> = {};
        const persistedForCompetence = allPersistedData[competence] || { classifications: {}, accountCodes: {} };
        
        initialItems.forEach(item => {
            let currentClassification = persistedForCompetence.classifications?.[item.uniqueItemId]?.classification;
            
            if (!currentClassification) {
                for (const otherCompetence in allPersistedData) {
                    if (otherCompetence !== competence) {
                        const classification = allPersistedData[otherCompetence]?.classifications?.[item.uniqueItemId]?.classification;
                        if (classification) {
                            currentClassification = classification;
                            break; 
                        }
                    }
                }
            }
            initialClassifications[item.id] = currentClassification || 'unclassified';

            const persistedCode = persistedForCompetence.accountCodes?.[item.id]?.accountCode;
            if (persistedCode) {
                initialCodes[item.id] = persistedCode;
            }
        });

        setSessionClassifications(initialClassifications);
        setSessionAccountCodes(initialCodes);
        setHasChanges(false);
        setRowSelection({});

    }, [competence, allPersistedData, initialItems]);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                if (Object.keys(rowSelection).length > 0) {
                    setRowSelection({});
                }
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [rowSelection]);


     const handleClassificationChange = (itemsToUpdate: ItemData[], newClassification: Classification) => {
        const newClassifications = { ...sessionClassifications };
        
        itemsToUpdate.forEach(item => {
            const itemsWithSameProductKey = initialItems.filter(i => i.uniqueItemId === item.uniqueItemId);
            itemsWithSameProductKey.forEach(i => {
                newClassifications[i.id] = newClassification;
            });
        });

        setSessionClassifications(newClassifications);
        setHasChanges(true);
    };

    const handleBulkClassification = (newClassification: Classification) => {
        const table = tableRef.current;
        if (!table) return;

        const selectedItems = table.getFilteredSelectedRowModel().rows.map(row => row.original);
        handleClassificationChange(selectedItems, newClassification);
        setRowSelection({}); 
    };

    
    const handleAccountCodeChange = (itemLineId: string, code: string) => {
        setSessionAccountCodes(prev => ({...prev, [itemLineId]: code}));
        setHasChanges(true);
    };

    const handleSaveChanges = () => {
        if (!competence) return;

        const updatedPersistedData = JSON.parse(JSON.stringify(allPersistedData));
        if (!updatedPersistedData[competence]) {
            updatedPersistedData[competence] = { classifications: {}, accountCodes: {} };
        }

        initialItems.forEach(item => {
            const sessionClassification = sessionClassifications[item.id];
            if (sessionClassification) {
                 if (!updatedPersistedData[competence].classifications) updatedPersistedData[competence].classifications = {};
                 updatedPersistedData[competence].classifications[item.uniqueItemId] = { classification: sessionClassification };
            }

            const sessionCode = sessionAccountCodes[item.id];
            if (sessionCode !== undefined) { 
                if (!updatedPersistedData[competence].accountCodes) updatedPersistedData[competence].accountCodes = {};
                updatedPersistedData[competence].accountCodes[item.id] = { accountCode: sessionCode };
            }
        });
        
        onPersistData(updatedPersistedData);
        setHasChanges(false);
    };

    const filteredItems = useMemo(() => {
        const categories: Record<Classification, ItemData[]> = {
            unclassified: [], imobilizado: [], 'uso-consumo': [], 'utilizado-em-obra': [],
        };

        initialItems.forEach(item => {
            let classification = sessionClassifications[item.id] || 'unclassified';
            if (!categories[classification]) {
                classification = 'unclassified';
            }
            categories[classification].push(item);
        });

        return categories;
    }, [initialItems, sessionClassifications]);
    
    const handleDownload = (data: ItemData[], classification: Classification) => {
        if (data.length === 0) {
            toast({ title: 'Nenhum dado para exportar', variant: 'destructive' });
            return;
        }

        const dataToExport = data.map(item => {
             const accountCode = sessionAccountCodes[item.id] || '';
            return {
                'Número da Nota': item['Número da Nota'],
                'Descrição': item['Descrição'],
                'CFOP': item['CFOP'],
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

    const tableRef = React.useRef<any>(null);
    
    const renderTableFor = (data: ItemData[], classification: Classification) => {
        if (!data || data.length === 0) {
            return <div className="text-center text-muted-foreground p-8">Nenhum item nesta categoria.</div>;
        }

        const columnsToShow: (keyof ItemData)[] = ['Fornecedor', 'CPF/CNPJ do Emitente', 'Número da Nota', 'Descrição', 'CFOP', 'Descricao CFOP', 'Valor Unitário', 'Valor Total'];
        const columns = getColumnsWithCustomRender(
            data,
            columnsToShow,
            (row, id) => {
                const value = row.getValue(id as any);
                 if ((id === 'Valor Total' || id === 'Valor Unitário') && typeof value === 'number') {
                    return <div className="text-right">{value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>;
                }
                return <div className="truncate max-w-xs">{String(value ?? '')}</div>;
            }
        );
        
        columns.unshift({
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

        if (classification === 'imobilizado') {
            columns.push({
                id: 'accountCode',
                header: 'Código do Ativo',
                cell: ({ row }: any) => {
                    const item = row.original as ItemData;
                    return (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <Input
                                placeholder="Ex: 1.2.3.01.0001"
                                value={sessionAccountCodes[item.id] || ''}
                                onChange={(e) => handleAccountCodeChange(item.id, e.target.value)}
                                className="h-8"
                            />
                        </div>
                    );
                }
            });
        }

        columns.push({
            id: 'actions',
            header: 'Ações Individuais',
            cell: ({ row }: any) => {
                const originalItem = row.original as ItemData;
                const currentClassification = sessionClassifications[originalItem.id] || 'unclassified';

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
                            {currentClassification !== 'unclassified' && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleClassificationChange([originalItem], 'unclassified')}>
                                            <RotateCcw className="h-5 w-5 text-destructive" />
                                        </Button>
                                    </TooltipTrigger><TooltipContent><p>Reverter para Não Classificado</p></TooltipContent>
                                </Tooltip>
                            )}
                        </div>
                    </TooltipProvider>
                );
            }
        });

        return <DataTable columns={columns} data={data} rowSelection={rowSelection} setRowSelection={setRowSelection} tableRef={tableRef} />;
    };

    if (!initialItems || initialItems.length === 0) {
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
                              <Button size="sm" variant="outline" onClick={() => handleBulkClassification('unclassified')}><RotateCcw className="mr-2 h-4 w-4" /> Reverter</Button>
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
                                <CardDescription>Classifique os itens. Clique nas linhas para selecionar múltiplos itens e use a barra de ações. Suas escolhas serão guardadas ao clicar no botão "Guardar Alterações".</CardDescription>
                            </div>
                        </div>
                        <Button onClick={handleSaveChanges} disabled={!hasChanges}>
                            <Save className="mr-2 h-4 w-4" /> Guardar Alterações
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <TooltipProvider>
                        <Tabs defaultValue="unclassified" className="w-full">
                            <TabsList className="grid w-full grid-cols-4">
                                <TabsTrigger value="unclassified" className="flex gap-2"><List />Não Classificados ({filteredItems.unclassified.length})</TabsTrigger>
                                <TabsTrigger value="imobilizado" className="flex gap-2"><Factory />Imobilizado ({filteredItems.imobilizado.length})</TabsTrigger>
                                <TabsTrigger value="uso-consumo" className="flex gap-2"><Wrench />Uso e Consumo ({filteredItems['uso-consumo'].length})</TabsTrigger>
                                <TabsTrigger value="utilizado-em-obra" className="flex gap-2"><HardHat />Utilizado em Obra ({filteredItems['utilizado-em-obra'].length})</TabsTrigger>
                            </TabsList>

                            <TabsContent value="unclassified" className="mt-6">
                                {renderTableFor(filteredItems.unclassified, 'unclassified')}
                            </TabsContent>
                            <TabsContent value="imobilizado" className="mt-6">
                                <Button onClick={() => handleDownload(filteredItems.imobilizado, 'imobilizado')} className="mb-4"><Download className="mr-2 h-4 w-4" /> Baixar</Button>
                                {renderTableFor(filteredItems.imobilizado, 'imobilizado')}
                            </TabsContent>
                            <TabsContent value="uso-consumo" className="mt-6">
                                <Button onClick={() => handleDownload(filteredItems['uso-consumo'], 'uso-consumo')} className="mb-4"><Download className="mr-2 h-4 w-4" /> Baixar</Button>
                                {renderTableFor(filteredItems['uso-consumo'], 'uso-consumo')}
                            </TabsContent>
                            <TabsContent value="utilizado-em-obra" className="mt-6">
                                <Button onClick={() => handleDownload(filteredItems['utilizado-em-obra'], 'utilizado-em-obra')} className="mb-4"><Download className="mr-2 h-4 w-4" /> Baixar</Button>
                                {renderTableFor(filteredItems['utilizado-em-obra'], 'utilizado-em-obra')}
                            </TabsContent>
                        </Tabs>
                    </TooltipProvider>
                </CardContent>
            </Card>
        </div>
    );
}
    