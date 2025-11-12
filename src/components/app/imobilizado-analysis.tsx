"use client";

import { useState, useMemo, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/components/app/columns-helper";
import { Building, Download, List, Factory, Wrench, HardHat, RotateCcw, Save, Settings, X, EyeOff, Copy } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { RowSelectionState, Table as ReactTable } from '@tanstack/react-table';
import { Checkbox } from '../ui/checkbox';
import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../ui/dialog';
import { cfopDescriptions } from '@/lib/cfop';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { cleanAndToStr } from '@/lib/utils';


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
                    classification: 'correct' | 'incorrect' | 'verify' | 'unvalidated';
                    isDifal: boolean;
                }
            }
        }
    };
}

const IMOBILIZADO_CFOP_EXCLUSION_KEY = 'imobilizadoCfopExclusionList';


interface ImobilizadoAnalysisProps {
    items: ItemData[]; 
    siengeFile?: File | null;
    competence: string | null; 
    onPersistData: (allDataToSave: AllClassifications) => void;
    allPersistedData: AllClassifications;
}

interface ClassificationTableProps {
    data: ItemData[];
    classification: Classification;
    rowSelection: RowSelectionState;
    setRowSelection: React.Dispatch<React.SetStateAction<RowSelectionState>>;
    tableRef: React.MutableRefObject<ReactTable<ItemData> | null>;
    sessionAccountCodes: Record<string, string>;
    handleAccountCodeChange: (itemLineId: string, code: string) => void;
    handleClassificationChange: (itemsToUpdate: ItemData[], newClassification: Classification) => void;
}


const ClassificationTable: React.FC<ClassificationTableProps> = ({ 
    data, 
    classification, 
    rowSelection, 
    setRowSelection, 
    tableRef, 
    sessionAccountCodes,
    handleAccountCodeChange,
    handleClassificationChange
}) => {
    const { toast } = useToast();

    const copyToClipboard = (text: string | number, type: string) => {
        const textToCopy = String(text);
        navigator.clipboard.writeText(textToCopy).then(() => {
            toast({ title: `${type} copiad${type.endsWith('a') ? 'a' : 'o'}`, description: textToCopy });
        }).catch(() => {
            toast({ variant: 'destructive', title: `Falha ao copiar ${type}` });
        });
    };

    const columns = useMemo(() => {
        const columnsToShow: (keyof ItemData)[] = ['Fornecedor', 'Número da Nota', 'Descrição', 'CFOP', 'Sienge_CFOP', 'Descricao CFOP', 'Valor Unitário', 'Valor Total'];
        const baseColumns = getColumnsWithCustomRender(
            data,
            columnsToShow,
            (row, id) => {
                const value = row.original[id as keyof typeof row.original];
                 if ((id === 'Valor Total' || id === 'Valor Unitário') && typeof value === 'number') {
                    return <div className="text-right">{value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>;
                }
                if (id === 'Fornecedor' && typeof value === 'string') {
                     return <div className="truncate max-w-[120px]" title={value}>{value}</div>;
                }
                 if (id === 'Número da Nota') {
                    return (
                        <div className="flex items-center gap-1 group justify-center">
                            <span>{value}</span>
                            <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); copyToClipboard(value, 'Número da Nota'); }}><Copy className="h-3 w-3" /></Button>
                        </div>
                    );
                }
                 if (id === 'Descrição') {
                    return (
                        <div className="flex items-center gap-1 group">
                            <p className="truncate max-w-[200px]" title={String(row.original['Descrição'])}>{value}</p>
                            <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); copyToClipboard(String(row.original['Descrição']), 'Descrição'); }}><Copy className="h-3 w-3" /></Button>
                        </div>
                    );
                }
                return <div className="truncate max-w-xs">{String(value ?? '')}</div>;
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

        if (classification === 'imobilizado') {
            baseColumns.push({
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

        baseColumns.push({
            id: 'actions',
            header: 'Ações Individuais',
            cell: ({ row }: any) => {
                const originalItem = row.original as ItemData;
                const currentClassification = classification;

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

        return baseColumns;
    }, [data, classification, sessionAccountCodes, handleAccountCodeChange, handleClassificationChange, toast]);
    
    if (!data || data.length === 0) {
        return <div className="text-center text-muted-foreground p-8">Nenhum item nesta categoria.</div>;
    }

    return <DataTable columns={columns} data={data} rowSelection={rowSelection} setRowSelection={setRowSelection} tableRef={tableRef} />;
}


export function ImobilizadoAnalysis({ items: initialAllItems, siengeFile, competence, onPersistData, allPersistedData }: ImobilizadoAnalysisProps) {
    const { toast } = useToast();
    
    const [hasChanges, setHasChanges] = useState(false);
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [isCfopModalOpen, setIsCfopModalOpen] = useState(false);
    const [isDisregardedModalOpen, setIsDisregardedModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<Classification>('unclassified');
    const [excludedCfops, setExcludedCfops] = useState<Set<string>>(new Set());
    const [siengeData, setSiengeData] = useState<any[] | null>(null);

     useEffect(() => {
        if (siengeFile) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = event.target?.result;
                    if (!data) throw new Error("Não foi possível ler o conteúdo do ficheiro.");
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    if (!sheetName) throw new Error("A planilha não contém nenhuma aba.");
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { range: 8, defval: null });
                    setSiengeData(jsonData);
                } catch (err: any) {
                    toast({ variant: 'destructive', title: 'Erro ao Processar Sienge', description: err.message });
                }
            };
            reader.onerror = (error) => toast({ variant: 'destructive', title: 'Erro ao Ler Ficheiro Sienge', description: error.message });
            reader.readAsArrayBuffer(siengeFile);
        } else {
            setSiengeData(null);
        }
    }, [siengeFile, toast]);

    // ===============================================================
    // CFOP Configuration Logic
    // ===============================================================
     useEffect(() => {
        try {
            const savedExclusions = localStorage.getItem(IMOBILIZADO_CFOP_EXCLUSION_KEY);
            if (savedExclusions) {
                setExcludedCfops(new Set(JSON.parse(savedExclusions)));
            }
        } catch (e) {
            console.error("Failed to load CFOP exclusions from localStorage", e);
        }
    }, []);

    const allCfopsInData = useMemo(() => {
        const cfopSet = new Set<string>();
        (initialAllItems || []).forEach(item => {
            if (item && item.CFOP) {
                cfopSet.add(String(item.CFOP));
            }
        });
        return Array.from(cfopSet).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    }, [initialAllItems]);

    const handleCfopToggle = (cfop: string, checked: boolean) => {
        const newExclusions = new Set(excludedCfops);
        if (!checked) { // Se desmarcado, adiciona à lista de exclusão
            newExclusions.add(cfop);
        } else { // Se marcado, remove da lista de exclusão
            newExclusions.delete(cfop);
        }
        setExcludedCfops(newExclusions);
    };

    const handleSaveCfopConfig = () => {
        try {
            localStorage.setItem(IMOBILIZADO_CFOP_EXCLUSION_KEY, JSON.stringify(Array.from(excludedCfops)));
            toast({ title: 'Configuração de CFOPs guardada!' });
            setIsCfopModalOpen(false);
        } catch (e) {
            toast({ variant: 'destructive', title: 'Erro ao guardar configuração' });
        }
    };

    const imobilizadoItems = useMemo(() => {
        if (!initialAllItems) return [];
    
        const siengeCfopMap = new Map<string, string>();
        if (siengeData) {
            const h = {
                numero: Object.keys(siengeData[0] || {}).find(k => k.toLowerCase().includes('número') || k.toLowerCase().includes('numero')),
                cnpj: Object.keys(siengeData[0] || {}).find(k => k.toLowerCase().includes('cnpj')),
                cfop: Object.keys(siengeData[0] || {}).find(k => k.toLowerCase() === 'cfop'),
            };
    
            if (h.numero && h.cnpj && h.cfop) {
                siengeData.forEach(siengeItem => {
                    const key = `${cleanAndToStr(siengeItem[h.numero!])}-${cleanAndToStr(siengeItem[h.cnpj!])}`;
                    if (!siengeCfopMap.has(key)) {
                        siengeCfopMap.set(key, siengeItem[h.cfop!]);
                    }
                });
            }
        }
    
        return initialAllItems
            .filter(item => {
                if (!item || !item.CFOP) return false;
                return !excludedCfops.has(String(item.CFOP));
            })
            .map(item => {
                const key = `${cleanAndToStr(item['Número da Nota'])}-${cleanAndToStr(item['CPF/CNPJ do Emitente'])}`;
                return {
                    ...item,
                    Sienge_CFOP: siengeCfopMap.get(key) || 'N/A',
                };
            });
    }, [initialAllItems, excludedCfops, siengeData]);

    const disregardedItems = useMemo(() => {
        return (initialAllItems || []).filter(item => {
            if (!item || !item.CFOP) return false;
            return excludedCfops.has(String(item.CFOP));
        });
    }, [initialAllItems, excludedCfops]);

    // ===============================================================
    // Classification and Persistence Logic
    // ===============================================================
    
    const { initialClassifications, initialCodes } = useMemo(() => {
        const classifications: Record<string, Classification> = {};
        const codes: Record<string, string> = {};
        if (competence) {
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
                classifications[item.id] = currentClassification || 'unclassified';

                const persistedCode = persistedForCompetence.accountCodes?.[item.id]?.accountCode;
                if (persistedCode) {
                    codes[item.id] = persistedCode;
                }
            });
        }
        return { initialClassifications: classifications, initialCodes: codes };
    }, [competence, allPersistedData, imobilizadoItems]);
    
    const [sessionClassifications, setSessionClassifications] = useState(initialClassifications);
    const [sessionAccountCodes, setSessionAccountCodes] = useState(initialCodes);
    
    useEffect(() => {
        setSessionClassifications(initialClassifications);
        setSessionAccountCodes(initialCodes);
        setHasChanges(false);
        setRowSelection({});
    }, [initialClassifications, initialCodes]);


    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (Object.keys(rowSelection).length > 0) {
                    setRowSelection({});
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
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
        setActiveTab(activeTab); // Stay on the same tab
    };

    const handleBulkClassification = (newClassification: Classification) => {
        const table = tableRef.current;
        if (!table) return;

        const selectedItems = table.getFilteredSelectedRowModel().rows.map(row => row.original as ItemData);
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
            
            // Corrige se a classificação for inválida
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

    const tableRef = React.useRef<ReactTable<ItemData> | null>(null);

    const onTabChange = (value: string) => {
        setRowSelection({}); // Clear selection when changing tabs
        setActiveTab(value as Classification);
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
                                <TooltipProvider>
                                     <Tooltip>
                                        <TooltipTrigger asChild>
                                             <DialogTrigger asChild>
                                                <Button variant="outline" size="icon">
                                                    <Settings className="h-4 w-4" />
                                                </Button>
                                            </DialogTrigger>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Configurar CFOPs para Imobilizado</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Configurar CFOPs para Análise de Imobilizado</DialogTitle>
                                        <DialogDescription>
                                            Desmarque os CFOPs que deseja **excluir** da análise de imobilizado. A sua seleção será guardada para futuras sessões.
                                        </DialogDescription>
                                    </DialogHeader>
                                    
                                    <ScrollArea className="h-96 w-full rounded-md border p-4">
                                        {allCfopsInData.map(cfop => (
                                            <div key={cfop} className="flex items-center justify-between p-2 rounded-md hover:bg-muted">
                                                <div className='flex items-center space-x-2'>
                                                     <Checkbox
                                                        id={`cfop-${cfop}`}
                                                        checked={!excludedCfops.has(cfop)}
                                                        onCheckedChange={(checked) => handleCfopToggle(cfop, !!checked)}
                                                    />
                                                    <Label htmlFor={`cfop-${cfop}`} className="flex flex-col">
                                                        <Badge variant="secondary">{cfop}</Badge>
                                                        <span className="ml-2 text-xs text-muted-foreground">{cfopDescriptions[parseInt(cfop, 10) as keyof typeof cfopDescriptions] || "Descrição não encontrada"}</span>
                                                    </Label>
                                                </div>
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
                                            Estes itens não estão a ser exibidos na análise principal porque o seu CFOP foi desmarcado na lista de configuração.
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
                        <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
                            <TabsList className="grid w-full grid-cols-4">
                                <TabsTrigger value="unclassified" className="flex gap-2"><List />Não Classificados ({filteredItems.unclassified.length})</TabsTrigger>
                                <TabsTrigger value="imobilizado" className="flex gap-2"><Factory />Imobilizado ({filteredItems.imobilizado.length})</TabsTrigger>
                                <TabsTrigger value="uso-consumo" className="flex gap-2"><Wrench />Uso e Consumo ({filteredItems['uso-consumo'].length})</TabsTrigger>
                                <TabsTrigger value="utilizado-em-obra" className="flex gap-2"><HardHat />Utilizado em Obra ({filteredItems['utilizado-em-obra'].length})</TabsTrigger>
                            </TabsList>

                            <TabsContent value="unclassified" className="mt-6">
                                <ClassificationTable data={filteredItems.unclassified} classification='unclassified' {...{rowSelection, setRowSelection, tableRef, sessionAccountCodes, handleAccountCodeChange, handleClassificationChange}} />
                            </TabsContent>
                            <TabsContent value="imobilizado" className="mt-6">
                                <Button onClick={() => handleDownload(filteredItems.imobilizado, 'imobilizado')} className="mb-4"><Download className="mr-2 h-4 w-4" /> Baixar</Button>
                                <ClassificationTable data={filteredItems.imobilizado} classification='imobilizado' {...{rowSelection, setRowSelection, tableRef, sessionAccountCodes, handleAccountCodeChange, handleClassificationChange}} />
                            </TabsContent>
                            <TabsContent value="uso-consumo" className="mt-6">
                                <Button onClick={() => handleDownload(filteredItems['uso-consumo'], 'uso-consumo')} className="mb-4"><Download className="mr-2 h-4 w-4" /> Baixar</Button>
                                <ClassificationTable data={filteredItems['uso-consumo']} classification='uso-consumo' {...{rowSelection, setRowSelection, tableRef, sessionAccountCodes, handleAccountCodeChange, handleClassificationChange}} />
                            </TabsContent>
                            <TabsContent value="utilizado-em-obra" className="mt-6">
                                <Button onClick={() => handleDownload(filteredItems['utilizado-em-obra'], 'utilizado-em-obra')} className="mb-4"><Download className="mr-2 h-4 w-4" /> Baixar</Button>
                                <ClassificationTable data={filteredItems['utilizado-em-obra']} classification='utilizado-em-obra' {...{rowSelection, setRowSelection, tableRef, sessionAccountCodes, handleAccountCodeChange, handleClassificationChange}} />
                            </TabsContent>
                        </Tabs>
                    </TooltipProvider>
                </CardContent>
            </Card>
        </div>
    );
}
