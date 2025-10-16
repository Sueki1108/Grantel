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


// Tipos
type Classification = 'unclassified' | 'imobilizado' | 'uso-consumo' | 'utilizado-em-obra';

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
    };
}


interface ImobilizadoAnalysisProps {
    items: ItemData[];
    competence: string | null; // ex: "2023-01_2023-02"
    onPersistedDataChange: (competence: string, uniqueItemId: string, itemLineId: string, data: Partial<AllClassifications[string]>) => void;
    persistedData: AllClassifications;
}

export function ImobilizadoAnalysis({ items: initialItems, competence, onPersistedDataChange, persistedData }: ImobilizadoAnalysisProps) {
    const { toast } = useToast();
    
    // Estado para gerir os códigos de conta em edição na sessão atual. A chave é o id da linha.
    const [sessionAccountCodes, setSessionAccountCodes] = useState<Record<string, string>>({});

    // Efeito para sincronizar o estado de edição com os dados persistidos.
    useEffect(() => {
        if (!competence) return;
        const initialCodes: Record<string, string> = {};
        const dataForCompetence = persistedData[competence]?.accountCodes || {};
        initialItems.forEach(item => {
            const persistedCode = dataForCompetence[item.id]?.accountCode;
            if (persistedCode) {
                initialCodes[item.id] = persistedCode;
            }
        });
        setSessionAccountCodes(initialCodes);
    }, [competence, persistedData, initialItems]);


    const getDisplayClassification = useCallback((itemUniqueId: string): Classification => {
        if (competence) {
            const classificationForCompetence = persistedData[competence]?.classifications?.[itemUniqueId]?.classification;
            if (classificationForCompetence) return classificationForCompetence;
        }
        
        for (const otherCompetence in persistedData) {
            const fallbackClassification = persistedData[otherCompetence]?.classifications?.[itemUniqueId]?.classification;
            if (fallbackClassification) return fallbackClassification;
        }
        
        return 'unclassified';

    }, [persistedData, competence]);

    const handleClassificationChange = (item: ItemData, newClassification: Classification) => {
        if (!competence) return;
        
        const newClassificationData = {
            [item.uniqueItemId]: { classification: newClassification }
        };
        
        onPersistedDataChange(competence, item.uniqueItemId, item.id, { classifications: newClassificationData });

        toast({
            title: "Item Classificado",
            description: `O item "${item['Descrição']?.substring(0, 20)}..." foi classificado como ${newClassification.replace('-', ' e ')}.`
        });
    };
    
    const handleAccountCodeChange = (itemLineId: string, code: string) => {
        setSessionAccountCodes(prev => ({...prev, [itemLineId]: code}));
    };

    const handleSaveAccountCode = (itemLineId: string) => {
        if (!competence) return;

        const codeToSave = sessionAccountCodes[itemLineId] ?? '';
        
        const newAccountCodeData: AccountCodeStorage = {
             [itemLineId]: { accountCode: codeToSave }
        };

        const item = initialItems.find(i => i.id === itemLineId);
        if (!item) return;

        onPersistedDataChange(competence, item.uniqueItemId, item.id, { accountCodes: newAccountCodeData });

        toast({
            title: "Código do Ativo Guardado",
            description: `O código foi associado a esta linha de item para a competência atual.`
        });
    };
    
    const handleUnclassify = (item: ItemData) => {
         if (!competence) return;
        handleClassificationChange(item, 'unclassified');
    };

    const filteredItems = useMemo(() => {
        const categories: Record<Classification, ItemData[]> = {
            unclassified: [],
            imobilizado: [],
            'uso-consumo': [],
            'utilizado-em-obra': [],
        };

        initialItems.forEach(item => {
            const classification = getDisplayClassification(item.uniqueItemId);
            categories[classification].push(item);
        });

        return categories;
    }, [initialItems, getDisplayClassification]);
    
    const handleDownload = (data: ItemData[], classification: Classification) => {
        if (data.length === 0) {
            toast({ title: 'Nenhum dado para exportar', variant: 'destructive' });
            return;
        }

        const dataToExport = data.map(item => {
             const accountCode = (competence && persistedData[competence]?.accountCodes?.[item.id]?.accountCode) || sessionAccountCodes[item.id] || '';
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
    
    const renderTableFor = (data: ItemData[], classification: Classification) => {
        if (!data || data.length === 0) {
            return <div className="text-center text-muted-foreground p-8">Nenhum item nesta categoria.</div>;
        }

        const columnsToShow: (keyof ItemData)[] = ['Número da Nota', 'Descrição', 'CFOP', 'Valor Unitário', 'Valor Total'];
        const columns = getColumnsWithCustomRender(
            data,
            columnsToShow,
            (row, id) => {
                const value = row.getValue(id as any);
                 if ((id === 'Valor Total' || id === 'Valor Unitário') && typeof value === 'number') {
                    return <div className="text-right">{value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>;
                }
                return <div>{String(value ?? '')}</div>;
            }
        );
        
        if (classification === 'imobilizado') {
            columns.push({
                id: 'accountCode',
                header: 'Código do Ativo',
                cell: ({ row }: any) => {
                    const item = row.original as ItemData;
                    const codeInSession = sessionAccountCodes[item.id] || '';
                    return (
                        <div className="flex items-center gap-2">
                            <Input
                                placeholder="Ex: 1.2.3.01.0001"
                                value={codeInSession}
                                onChange={(e) => handleAccountCodeChange(item.id, e.target.value)}
                                className="h-8"
                            />
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleSaveAccountCode(item.id)}>
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
                const currentClassification = getDisplayClassification(originalItem.uniqueItemId);

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
