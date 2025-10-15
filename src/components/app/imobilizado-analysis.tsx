"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/lib/columns-helper";
import { Building, Download, List, Factory, Wrench, HardHat, RotateCcw, Save } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cleanAndToStr } from '@/lib/utils';


// Tipos
type Classification = 'unclassified' | 'imobilizado' | 'uso-consumo' | 'utilizado-em-obra';

export interface ItemData extends Record<string, any> {
    id: string; // Chave Única da Nota + N° do Item
    uniqueItemId: string; // Chave para persistência (CNPJ-CodigoProduto)
}

export interface ClassificationStorage {
    classification: Classification;
    accountCode?: string;
}

// A estrutura geral que será guardada no localStorage
export interface AllClassifications {
    [competence: string]: {
        [uniqueItemId: string]: ClassificationStorage;
    };
}


interface ImobilizadoAnalysisProps {
    items: ItemData[];
    competence: string | null; // ex: "2023-01_2023-02"
    onPersistedDataChange: (key: string, data: ClassificationStorage) => void;
    persistedData: AllClassifications;
}

export function ImobilizadoAnalysis({ items: initialItems, competence, onPersistedDataChange, persistedData }: ImobilizadoAnalysisProps) {
    const { toast } = useToast();
    
    const [sessionAccountCodes, setSessionAccountCodes] = useState<Record<string, string>>({});

    const getDisplayData = useCallback((itemUniqueId: string): ClassificationStorage => {
        if (!competence) return { classification: 'unclassified', accountCode: '' };

        const dataForCompetence = persistedData[competence] || {};
        const specificItemData = dataForCompetence[itemUniqueId];
        
        const sessionCode = sessionAccountCodes[itemUniqueId];
        
        if (specificItemData) {
            return {
                classification: specificItemData.classification,
                accountCode: sessionCode !== undefined ? sessionCode : specificItemData.accountCode
            };
        }
        
        // Fallback: Check other competences for the same item
        for (const otherCompetence in persistedData) {
            if (otherCompetence !== competence && persistedData[otherCompetence]?.[itemUniqueId]) {
                const fallbackData = persistedData[otherCompetence][itemUniqueId];
                return {
                     classification: fallbackData.classification,
                     accountCode: sessionCode !== undefined ? sessionCode : fallbackData.accountCode
                };
            }
        }
        
        return { classification: 'unclassified', accountCode: sessionCode || '' };

    }, [persistedData, competence, sessionAccountCodes]);

    const handleClassificationChange = (item: ItemData, newClassification: Classification) => {
        if (!competence) return;
        const currentDisplayData = getDisplayData(item.uniqueItemId);
        
        onPersistedDataChange(item.uniqueItemId, {
            classification: newClassification,
            accountCode: currentDisplayData.accountCode
        });
        toast({
            title: "Item Classificado",
            description: `O item "${item['Descrição']?.substring(0, 20)}..." foi classificado como ${newClassification}.`
        });
    };
    
    const handleAccountCodeChange = (itemUniqueId: string, code: string) => {
        setSessionAccountCodes(prev => ({...prev, [itemUniqueId]: code}));
    };

    const handleSaveAccountCode = (itemUniqueId: string) => {
        if (!competence) return;
        
        const displayData = getDisplayData(itemUniqueId);
        if(displayData.classification === 'unclassified') {
            toast({variant: 'destructive', title: 'Item não classificado', description: 'Classifique o item antes de guardar um código de conta.'});
            return;
        }

        const newStorageValue: ClassificationStorage = {
            classification: displayData.classification,
            accountCode: sessionAccountCodes[itemUniqueId] ?? displayData.accountCode ?? ''
        };

        onPersistedDataChange(itemUniqueId, newStorageValue);

        toast({
            title: "Código do Ativo Guardado",
            description: `O código foi associado a este item para a competência atual.`
        });
    };
    
    const handleUnclassify = (item: ItemData) => {
         if (!competence) return;
        onPersistedDataChange(item.uniqueItemId, { classification: 'unclassified', accountCode: undefined });
         toast({
            title: "Classificação Removida",
        });
    };

    const filteredItems = useMemo(() => {
        const categories: Record<Classification, ItemData[]> = {
            unclassified: [],
            imobilizado: [],
            'uso-consumo': [],
            'utilizado-em-obra': [],
        };

        initialItems.forEach(item => {
            const displayData = getDisplayData(item.uniqueItemId);
            categories[displayData.classification].push(item);
        });

        return categories;
    }, [initialItems, getDisplayData]);
    
    const handleDownload = (data: ItemData[], classification: Classification) => {
        if (data.length === 0) {
            toast({ title: 'Nenhum dado para exportar', variant: 'destructive' });
            return;
        }

        const dataToExport = data.map(item => {
            const displayData = getDisplayData(item.uniqueItemId);
            return {
                'Número da Nota': item['Número da Nota'],
                'Descrição': item['Descrição'],
                'CFOP': item['CFOP'],
                'Descricao CFOP': (item['Descricao CFOP'] || '').substring(0, 20),
                'Valor Total': item['Valor Total'],
                'Código do Ativo': displayData.accountCode || '',
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, `Classificação`);
        XLSX.writeFile(workbook, `Grantel - Imobilizado - ${classification}.xlsx`);
        toast({ title: 'Download Iniciado' });
    };
    
    const renderTableFor = (data: ItemData[], classification: Classification) => {
        if (!data || data.length === 0) {
            return <div className="text-center text-muted-foreground p-8">Nenhum item nesta categoria.</div>;
        }

        const columns = getColumnsWithCustomRender(
            data,
            ['Número da Nota', 'Descrição', 'CFOP', 'Valor Total'],
            (row, id) => {
                const value = row.getValue(id as any);
                 if (id === 'Valor Total' && typeof value === 'number') {
                    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                }
                return <div>{String(value ?? '')}</div>;
            }
        );
        
        if (classification !== 'unclassified') {
            columns.push({
                id: 'accountCode',
                header: 'Código do Ativo',
                cell: ({ row }: any) => {
                    const item = row.original as ItemData;
                    const displayData = getDisplayData(item.uniqueItemId);
                    return (
                        <div className="flex items-center gap-2">
                            <Input
                                placeholder="Ex: 1.2.3.01.0001"
                                value={displayData.accountCode || ''}
                                onChange={(e) => handleAccountCodeChange(item.uniqueItemId, e.target.value)}
                                className="h-8"
                            />
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleSaveAccountCode(item.uniqueItemId)}>
                                        <Save className="h-4 w-4 text-primary" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>Guardar código</p></TooltipContent>
                            </Tooltip>
                        </div>
                    );
                }
            });
        }

        columns.push({
            id: 'actions',
            header: 'Ações',
            cell: ({ row }: any) => {
                const originalItem = row.original as ItemData;
                const currentClassification = getDisplayData(originalItem.uniqueItemId).classification;

                return (
                    <div className="flex gap-2 justify-center">
                         {currentClassification !== 'imobilizado' && (
                            <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleClassificationChange(originalItem, 'imobilizado')}><Factory className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Classificar como Imobilizado</p></TooltipContent></Tooltip>
                        )}
                        {currentClassification !== 'uso-consumo' && (
                             <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleClassificationChange(originalItem, 'uso-consumo')}><Wrench className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Classificar como Uso e Consumo</p></TooltipContent></Tooltip>
                        )}
                        {currentClassification !== 'utilizado-em-obra' && (
                            <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleClassificationChange(originalItem, 'utilizado-em-obra')}><HardHat className="h-5 w-5" /></Button></TooltipTrigger><TooltipContent><p>Classificar como Utilizado em Obra</p></TooltipContent></Tooltip>
                        )}
                        {currentClassification !== 'unclassified' && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleUnclassify(originalItem)}>
                                        <RotateCcw className="h-5 w-5 text-destructive" />
                                    </Button>
                                </TooltipTrigger><TooltipContent><p>Reverter para Não Classificado</p></TooltipContent>
                            </Tooltip>
                        )}
                    </div>
                );
            }
        });

        return <DataTable columns={columns} data={data} />;
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

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3"><Building className="h-8 w-8 text-primary" /><div><CardTitle className="font-headline text-2xl">Análise de Imobilizado (Competência: {competence})</CardTitle><CardDescription>Classifique os itens. Suas escolhas serão lembradas para esta competência e sugeridas para as próximas.</CardDescription></div></div>
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
                            <CardContent>
                                {renderTableFor(filteredItems.unclassified, 'unclassified')}
                            </CardContent>
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
    );
}
