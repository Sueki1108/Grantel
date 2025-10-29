
"use client";

import { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/lib/columns-helper";
import { Building, Download, List, Factory, Wrench, HardHat, RotateCcw, Save, Settings, X, PlusCircle, EyeOff } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { RowSelectionState } from '@tanstack/react-table';
import { Checkbox } from '../ui/checkbox';
import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { cfopDescriptions } from '@/lib/cfop';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';


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

const IMOBILIZADO_CFOP_CONFIG_KEY = 'imobilizadoCfopConfig';
const defaultImobilizadoCfops = ['1551', '2551', '1556', '2556'];

interface ImobilizadoAnalysisProps {
    allItems: ItemData[]; // All valid items from the main validation
    competence: string | null; // ex: "2023-01_2023-02"
    onPersistData: (allDataToSave: AllClassifications) => void;
    allPersistedData: AllClassifications;
}

export function ImobilizadoAnalysis({ allItems: initialAllItems, competence, onPersistData, allPersistedData }: ImobilizadoAnalysisProps) {
    const { toast } = useToast();
    
    const [sessionClassifications, setSessionClassifications] = useState<Record<string, Classification>>({});
    const [sessionAccountCodes, setSessionAccountCodes] = useState<Record<string, string>>({});
    const [hasChanges, setHasChanges] = useState(false);
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [configuredCfops, setConfiguredCfops] = useState<string[]>(defaultImobilizadoCfops);
    const [isCfopModalOpen, setIsCfopModalOpen] = useState(false);
    const [newCfopInput, setNewCfopInput] = useState('');
    const [isDisregardedModalOpen, setIsDisregardedModalOpen] = useState(false);

    // ===============================================================
    // CFOP Configuration Logic
    // ===============================================================
    useEffect(() => {
        try {
            const savedCfops = localStorage.getItem(IMOBILIZADO_CFOP_CONFIG_KEY);
            if (savedCfops) {
                setConfiguredCfops(JSON.parse(savedCfops));
            }
        } catch (e) {
            console.error("Failed to load CFOP config from localStorage", e);
        }
    }, []);

    const handleSaveCfopConfig = () => {
        try {
            localStorage.setItem(IMOBILIZADO_CFOP_CONFIG_KEY, JSON.stringify(configuredCfops));
            toast({ title: 'Configuração de CFOPs guardada!' });
            setIsCfopModalOpen(false);
        } catch (e) {
            toast({ variant: 'destructive', title: 'Erro ao guardar configuração' });
        }
    };

    const handleAddCfop = () => {
        const cfopToAdd = newCfopInput.trim();
        if (cfopToAdd && !configuredCfops.includes(cfopToAdd)) {
            if (cfopDescriptions[parseInt(cfopToAdd, 10)]) {
                setConfiguredCfops([...configuredCfops, cfopToAdd]);
                setNewCfopInput('');
            } else {
                toast({ variant: 'destructive', title: 'CFOP Inválido', description: 'O código inserido não foi encontrado na lista de CFOPs.' });
            }
        }
    };

    const handleRemoveCfop = (cfopToRemove: string) => {
        setConfiguredCfops(configuredCfops.filter(c => c !== cfopToRemove));
    };

    // Filter items based on configured CFOPs
    const imobilizadoItems = useMemo(() => {
        return (initialAllItems || []).filter(item => {
            if (!item || !item.CFOP) return false;
            return configuredCfops.includes(String(item.CFOP));
        });
    }, [initialAllItems, configuredCfops]);

    const disregardedItems = useMemo(() => {
        return (initialAllItems || []).filter(item => {
            if (!item || !item.CFOP) return true; // Keep if no CFOP
            return !configuredCfops.includes(String(item.CFOP));
        });
    }, [initialAllItems, configuredCfops]);


    // ===============================================================
    // Classification and Persistence Logic
    // ===============================================================
    useEffect(() => {
        if (!competence) return;
        
        const initialClassifications: Record<string, Classification> = {};
        const initialCodes: Record<string, string> = {};
        const persistedForCompetence = allPersistedData[competence] || { classifications: {}, accountCodes: {} };
        
        imobilizadoItems.forEach(item => {
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

    }, [competence, allPersistedData, imobilizadoItems]);
    
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
            const itemsWithSameProductKey = imobilizadoItems.filter(i => i.uniqueItemId === item.uniqueItemId);
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
        if (!updatedPersistedData[competence].classifications) {
            updatedPersistedData[competence].classifications = {};
        }
        if (!updatedPersistedData[competence].accountCodes) {
            updatedPersistedData[competence].accountCodes = {};
        }
    
        imobilizadoItems.forEach(item => {
            const sessionClassification = sessionClassifications[item.id];
            
            if (sessionClassification && sessionClassification !== 'unclassified') {
                 updatedPersistedData[competence].classifications[item.uniqueItemId] = { classification: sessionClassification };
            } else if (sessionClassification === 'unclassified') {
                if (updatedPersistedData[competence].classifications[item.uniqueItemId]) {
                    delete updatedPersistedData[competence].classifications[item.uniqueItemId];
                }
            }
    
            const sessionCode = sessionAccountCodes[item.id];
            if (sessionCode !== undefined) { 
                updatedPersistedData[competence].accountCodes[item.id] = { accountCode: sessionCode };
            }
        });
        
        onPersistData(updatedPersistedData);
        setHasChanges(false);
        toast({title: 'Alterações guardadas!'});
    };

    const filteredItems = useMemo(() => {
        const categories: Record<Classification, ItemData[]> = {
            unclassified: [], imobilizado: [], 'uso-consumo': [], 'utilizado-em-obra': [],
        };

        imobilizadoItems.forEach(item => {
            let classification = sessionClassifications[item.id] || 'unclassified';
            if (!categories[classification]) {
                classification = 'unclassified';
            }
            categories[classification].push(item);
        });

        return categories;
    }, [imobilizadoItems, sessionClassifications]);
    
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
                        <div className='flex items-center gap-2'>
                             <Dialog open={isCfopModalOpen} onOpenChange={setIsCfopModalOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline"><Settings className="mr-2 h-4 w-4"/>Configurar CFOPs</Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Configurar CFOPs para Análise de Imobilizado</DialogTitle>
                                        <DialogDescription>
                                            Adicione ou remova os CFOPs que devem ser considerados ao filtrar os itens para esta análise.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="flex items-center space-x-2 my-4">
                                        <Input
                                            placeholder="Adicionar novo CFOP"
                                            value={newCfopInput}
                                            onChange={(e) => setNewCfopInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddCfop()}
                                        />
                                        <Button onClick={handleAddCfop}><PlusCircle className="mr-2 h-4 w-4"/>Adicionar</Button>
                                    </div>
                                    <ScrollArea className="h-72 w-full rounded-md border p-4">
                                        {configuredCfops.map(cfop => (
                                            <div key={cfop} className="flex items-center justify-between p-2 rounded-md hover:bg-muted">
                                                <div>
                                                    <Badge variant="secondary">{cfop}</Badge>
                                                    <span className="ml-2 text-sm text-muted-foreground">{cfopDescriptions[parseInt(cfop, 10)] || "Descrição não encontrada"}</span>
                                                </div>
                                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemoveCfop(cfop)}>
                                                    <X className="h-4 w-4"/>
                                                </Button>
                                            </div>
                                        ))}
                                    </ScrollArea>
                                    <DialogFooter>
                                        <Button variant="outline" onClick={() => setIsCfopModalOpen(false)}>Cancelar</Button>
                                        <Button onClick={handleSaveCfopConfig}>Guardar e Fechar</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                             <Dialog open={isDisregardedModalOpen} onOpenChange={setIsDisregardedModalOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="secondary"><EyeOff className="mr-2 h-4 w-4"/>Ver Itens Desconsiderados ({disregardedItems.length})</Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-4xl h-[80vh]">
                                    <DialogHeader>
                                        <DialogTitle>Itens Desconsiderados da Análise de Imobilizado</DialogTitle>
                                        <DialogDescription>
                                            Estes itens não estão a ser exibidos na análise principal porque o seu CFOP não está na lista configurada.
                                        </DialogDescription>
                                    </DialogHeader>
                                     <DataTable columns={getColumnsWithCustomRender(disregardedItems, ['Fornecedor', 'Número da Nota', 'Descrição', 'CFOP', 'Descricao CFOP', 'Valor Total'])} data={disregardedItems} />
                                </DialogContent>
                            </Dialog>
                            <Button onClick={handleSaveChanges} disabled={!hasChanges}>
                                <Save className="mr-2 h-4 w-4" /> Guardar Alterações
                            </Button>
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
    

    