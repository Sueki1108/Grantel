"use client";

import { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/app/data-table";
import { getColumns, getColumnsWithCustomRender } from "@/lib/columns-helper";
import { Building, Download, List, Factory, Wrench, HardHat, RotateCcw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";


type Classification = 'unclassified' | 'imobilizado' | 'uso-consumo' | 'utilizado-em-obra';

interface Item extends Record<string, any> {
    id: string;
}

interface ImobilizadoAnalysisProps {
    items: Item[];
    onClassificationChange: (classifications: Record<string, Classification>) => void;
    initialClassifications: Record<string, Classification>;
}

export function ImobilizadoAnalysis({ items: initialItems, onClassificationChange, initialClassifications }: ImobilizadoAnalysisProps) {
    const { toast } = useToast();
    const [classifiedItems, setClassifiedItems] = useState<Record<string, Classification>>(initialClassifications);
    const [accountCodes, setAccountCodes] = useState({
        imobilizado: '',
        'uso-consumo': '',
        'utilizado-em-obra': ''
    });

    useEffect(() => {
        setClassifiedItems(initialClassifications);
    }, [initialClassifications]);

    const handleClassify = (itemId: string, classification: Classification) => {
        const newClassifications = {
            ...classifiedItems,
            [itemId]: classification
        };
        setClassifiedItems(newClassifications);
        onClassificationChange(newClassifications);
    };

    const handleUnclassify = (itemId: string) => {
        const newClassifications = { ...classifiedItems };
        delete newClassifications[itemId];
        setClassifiedItems(newClassifications);
        onClassificationChange(newClassifications);
    };
    
    const handleAccountCodeChange = (classification: keyof typeof accountCodes, value: string) => {
        setAccountCodes(prev => ({ ...prev, [classification]: value }));
    };

    const filteredItems = useMemo(() => {
        const unclassified: Item[] = [];
        const imobilizado: Item[] = [];
        const usoConsumo: Item[] = [];
        const utilizadoEmObra: Item[] = [];

        initialItems.forEach(item => {
            const classification = classifiedItems[item.id] || 'unclassified';
            switch (classification) {
                case 'imobilizado':
                    imobilizado.push(item);
                    break;
                case 'uso-consumo':
                    usoConsumo.push(item);
                    break;
                case 'utilizado-em-obra':
                    utilizadoEmObra.push(item);
                    break;
                default:
                    unclassified.push(item);
                    break;
            }
        });

        return { unclassified, imobilizado, 'uso-consumo': usoConsumo, 'utilizado-em-obra': utilizadoEmObra };
    }, [initialItems, classifiedItems]);
    
    const handleDownload = (data: Item[], classification: Classification) => {
        if (data.length === 0) {
            toast({ title: 'Nenhum dado para exportar', variant: 'destructive' });
            return;
        }
        
        const code = classification !== 'unclassified' ? accountCodes[classification as keyof typeof accountCodes] : '';

        const dataToExport = data.map(item => {
            const baseItem: Record<string, any> = {
                'Número da Nota': item['Número da Nota'],
                'Descrição': item['Descrição'],
                'CFOP': item['CFOP'],
                'Descricao CFOP': (item['Descricao CFOP'] || '').substring(0, 20),
                'Valor Total': item['Valor Total'],
            };
            if(code) {
                baseItem['Código da Conta'] = code;
            }
            return baseItem;
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, `Classificação`);
        XLSX.writeFile(workbook, `Grantel - Imobilizado - ${classification}.xlsx`);
        toast({ title: 'Download Iniciado' });
    };
    
    const renderTableFor = (data: Item[], classification: Classification) => {
        if (!data || data.length === 0) {
            return <div className="text-center text-muted-foreground p-8">Nenhum item nesta categoria.</div>;
        }

        const columns = getColumnsWithCustomRender(
            data,
            ['Número da Nota', 'Descrição', 'CFOP', 'Descricao CFOP', 'Valor Total'],
            (row, id) => {
                const value = row.getValue(id as any);
                if (id === 'Descricao CFOP' && typeof value === 'string') {
                    return <div title={value}>{value.substring(0, 20)}...</div>;
                }
                 if (id === 'Valor Total' && typeof value === 'number') {
                    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                }
                return <div>{String(value ?? '')}</div>;
            }
        );

        columns.push({
            id: 'actions',
            header: 'Ações',
            cell: ({ row }: any) => {
                const originalItem = initialItems.find(item => item.id === row.original.id);
                if (!originalItem) return null;
                
                if (classification === 'unclassified') {
                    return (
                        <div className="flex gap-2 justify-center">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleClassify(originalItem.id, 'imobilizado')}><Factory className="h-5 w-5" /></Button>
                                </TooltipTrigger>
                                <TooltipContent><p>Classificar como Imobilizado</p></TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleClassify(originalItem.id, 'uso-consumo')}><Wrench className="h-5 w-5" /></Button>
                                </TooltipTrigger>
                                <TooltipContent><p>Classificar como Uso e Consumo</p></TooltipContent>
                            </Tooltip>
                             <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleClassify(originalItem.id, 'utilizado-em-obra')}><HardHat className="h-5 w-5" /></Button>
                                </TooltipTrigger>
                                <TooltipContent><p>Classificar como Utilizado em Obra</p></TooltipContent>
                            </Tooltip>
                        </div>
                    );
                } else {
                    return (
                        <div className="flex justify-center">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleUnclassify(originalItem.id)}><RotateCcw className="h-5 w-5 text-destructive" /></Button>
                                </TooltipTrigger>
                                <TooltipContent><p>Reverter para Não Classificado</p></TooltipContent>
                            </Tooltip>
                        </div>
                    );
                }
            }
        });

        return <DataTable columns={columns} data={data} />;
    };

    const ClassificationTabContent = ({
        data,
        classification,
        title,
        description,
        showAccountCode = false,
    }: {
        data: Item[];
        classification: Classification;
        title: string;
        description: string;
        showAccountCode?: boolean;
    }) => (
         <CardContent>
            {showAccountCode && (
                <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-end mb-6 p-4 border rounded-lg bg-muted/50">
                    <div className="grid gap-1.5">
                        <Label htmlFor={`${classification}-code`}>Definir Código de Conta para {title}</Label>
                        <Input
                            id={`${classification}-code`}
                            placeholder={`Ex: 1.2.3.01.0001`}
                            value={accountCodes[classification as keyof typeof accountCodes]}
                            onChange={(e) => handleAccountCodeChange(classification as keyof typeof accountCodes, e.target.value)}
                            className="max-w-xs"
                        />
                        <p className="text-sm text-muted-foreground">{description}</p>
                    </div>
                    <Button onClick={() => handleDownload(data, classification)} disabled={data.length === 0}>
                        <Download className="mr-2 h-4 w-4" /> Exportar para Excel
                    </Button>
                </div>
            )}
             {!showAccountCode && (
                 <div className="flex justify-end mb-4">
                      <Button onClick={() => handleDownload(data, classification)} disabled={data.length === 0}>
                        <Download className="mr-2 h-4 w-4" /> Exportar para Excel
                    </Button>
                 </div>
            )}
            {renderTableFor(data, classification)}
        </CardContent>
    );

    if (!initialItems || initialItems.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <Building className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="font-headline text-2xl">Análise de Imobilizado</CardTitle>
                            <CardDescription>Classifique itens relevantes para imobilizado, despesa ou consumo.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-8 text-center text-muted-foreground">
                    <Building className="mx-auto h-12 w-12 mb-4" />
                    <h3 className="text-xl font-semibold mb-2">Aguardando dados</h3>
                    <p>Execute a "Validação de Documentos" na primeira aba para carregar os itens para análise.</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <Building className="h-8 w-8 text-primary" />
                    <div>
                        <CardTitle className="font-headline text-2xl">Análise de Imobilizado</CardTitle>
                        <CardDescription>Classifique itens relevantes e defina os códigos de conta correspondentes.</CardDescription>
                    </div>
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
                            <CardContent>
                                {renderTableFor(filteredItems.unclassified, 'unclassified')}
                            </CardContent>
                        </TabsContent>
                        <TabsContent value="imobilizado" className="mt-6">
                            <ClassificationTabContent
                                data={filteredItems.imobilizado}
                                classification="imobilizado"
                                title="Imobilizado"
                                description="Código para itens classificados como ativo imobilizado."
                                showAccountCode={true}
                            />
                        </TabsContent>
                        <TabsContent value="uso-consumo" className="mt-6">
                            <ClassificationTabContent
                                data={filteredItems['uso-consumo']}
                                classification="uso-consumo"
                                title="Uso e Consumo"
                                description="Código para itens classificados como material de uso e consumo."
                                showAccountCode={true}
                            />
                        </TabsContent>
                        <TabsContent value="utilizado-em-obra" className="mt-6">
                             <ClassificationTabContent
                                data={filteredItems['utilizado-em-obra']}
                                classification="utilizado-em-obra"
                                title="Utilizado em Obra"
                                description="Código para itens classificados como utilizados em obra."
                                showAccountCode={true}
                            />
                        </TabsContent>
                    </Tabs>
                </TooltipProvider>
            </CardContent>
        </Card>
    );
}
