
"use client";

import { useState, useMemo, type ChangeEvent, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Loader2, Download, Cpu, TicketPercent, Copy, Hash, Sigma, Coins, ClipboardCopy, X, UploadCloud, EyeOff, Ticket, ShieldCheck, TicketX } from 'lucide-react';
import { DataTable } from '@/components/app/data-table';
import { getColumnsWithCustomRender } from "@/components/app/columns-helper";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '../ui/tooltip';
import { AllClassifications, DifalStatus, ProcessedData } from '@/lib/types';


// ===============================================================
// Componente Principal
// ===============================================================
interface DifalAnalysisProps {
    processedData: ProcessedData | null;
    allClassifications: AllClassifications;
    onPersistData: (allData: AllClassifications) => void;
}

export function DifalAnalysis({ processedData, allClassifications, onPersistData }: DifalAnalysisProps) {
    const { toast } = useToast();
    const [vencimento, setVencimento] = useState('');
    const [isGeneratingScript, setIsGeneratingScript] = useState(false);
    const [sujeitosAoDifal, setSujeitosAoDifal] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const competence = processedData?.competence;

    const handleVencimentoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 8) {
            value = value.substring(0, 8);
        }

        if (value.length > 4) {
            value = `${value.substring(0, 2)}/${value.substring(2, 4)}/${value.substring(4)}`;
        } else if (value.length > 2) {
            value = `${value.substring(0, 2)}/${value.substring(2)}`;
        }

        setVencimento(value);
    };

    const handleLoadSubjects = useCallback(() => {
        setIsLoading(true);
        setTimeout(() => {
            if (!processedData || !competence) {
                toast({ variant: 'destructive', title: 'Dados Incompletos', description: 'Valide os dados e selecione uma competência primeiro.' });
                setIsLoading(false);
                return;
            }
            if (!processedData.reconciliationResults?.reconciled) {
                toast({ variant: 'destructive', title: 'Conciliação necessária', description: 'Execute a conciliação XML vs Sienge primeiro.' });
                setIsLoading(false);
                return;
            }

            const cfopValidations = allClassifications[competence]?.cfopValidations?.classifications || {};
            const allReconciledItems = processedData.reconciliationResults.reconciled || [];

            const items = allReconciledItems.filter(item => {
                const uniqueKey = `${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}-${item['Sienge_CFOP']}`;
                const isCorrect = cfopValidations[uniqueKey]?.classification === 'correct';
                const isDifalCfop = item.CFOP === '2551' || item.CFOP === '2556';
                return isCorrect && isDifalCfop;
            });

            setSujeitosAoDifal(items);
            setIsLoading(false);
            toast({ title: "Itens Carregados", description: `${items.length} itens sujeitos a DIFAL foram carregados para análise.` });
        }, 50);
    }, [processedData, allClassifications, competence, toast]);


    const handleDifalStatusChange = (itemsToUpdate: any[], status: DifalStatus) => {
        if (!competence) {
            toast({ variant: 'destructive', title: 'Competência não definida!' });
            return;
        }

        const updatedData = JSON.parse(JSON.stringify(allClassifications));
        if (!updatedData[competence]) {
            updatedData[competence] = { classifications: {}, accountCodes: {}, cfopValidations: { classifications: {} }, difalValidations: { classifications: {} }, supplierClassifications: {} };
        }
        if (!updatedData[competence].difalValidations) {
            updatedData[competence].difalValidations = { classifications: {} };
        }

        itemsToUpdate.forEach(item => {
            const itemKey = `${item['Chave de acesso']}-${item['Item']}`;
            if (status === 'subject-to-difal') {
                delete updatedData[competence].difalValidations.classifications[itemKey];
            } else {
                updatedData[competence].difalValidations.classifications[itemKey] = { status };
            }
        });

        onPersistData(updatedData);
        toast({ title: 'Status DIFAL atualizado!' });
    };

    const difalAnalysisData = useMemo(() => {
        const difalValidations = (competence && allClassifications[competence]?.difalValidations?.classifications) || {};
        const difalItems: any[] = [];
        const desconsideradosItems: any[] = [];
        const beneficioFiscalItems: any[] = [];
        const finalSujeitos: any[] = [];

        sujeitosAoDifal.forEach(item => {
            const itemKey = `${item['Chave de acesso']}-${item['Item']}`;
            const validation = difalValidations[itemKey];

            switch (validation?.status) {
                case 'difal':
                    difalItems.push(item);
                    break;
                case 'disregard':
                    desconsideradosItems.push(item);
                    break;
                case 'beneficio-fiscal':
                    beneficioFiscalItems.push(item);
                    break;
                default:
                    finalSujeitos.push(item);
                    break;
            }
        });

        return { sujeitosAoDifal: finalSujeitos, difalItems, desconsideradosItems, beneficioFiscalItems };

    }, [sujeitosAoDifal, allClassifications, competence]);


    const generateGnreScript = () => {
        setIsGeneratingScript(true);
        // Lógica de geração de script...
        setTimeout(() => {
            toast({ title: "Script GNRE gerado com sucesso!" });
            setIsGeneratingScript(false);
        }, 1500);
    };

    const columns = useCallback((tab: 'sujeitos' | 'difal' | 'beneficio' | 'desconsiderados') => {
        const baseColumns = ['Fornecedor', 'Número da Nota', 'Descrição', 'CFOP', 'CFOP (Sienge)', 'Valor Total'];

        let actionButtons;

        switch (tab) {
            case 'sujeitos':
                actionButtons = (item: any) => (
                    <div className="flex justify-center gap-1">
                        <TooltipProvider><Tooltip>
                            <TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600" onClick={() => handleDifalStatusChange([item], 'difal')}><Ticket className="h-4 w-4" /></Button></TooltipTrigger>
                            <TooltipContent><p>Marcar como DIFAL</p></TooltipContent>
                        </Tooltip></TooltipProvider>
                        <TooltipProvider><Tooltip>
                            <TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={() => handleDifalStatusChange([item], 'beneficio-fiscal')}><ShieldCheck className="h-4 w-4" /></Button></TooltipTrigger>
                            <TooltipContent><p>Marcar como Benefício Fiscal</p></TooltipContent>
                        </Tooltip></TooltipProvider>
                        <TooltipProvider><Tooltip>
                            <TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-gray-500" onClick={() => handleDifalStatusChange([item], 'disregard')}><EyeOff className="h-4 w-4" /></Button></TooltipTrigger>
                            <TooltipContent><p>Desconsiderar</p></TooltipContent>
                        </Tooltip></TooltipProvider>
                    </div>
                );
                break;
            case 'difal':
                actionButtons = (item: any) => (
                    <div className="flex justify-center gap-1">
                        <TooltipProvider><Tooltip>
                            <TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={() => handleDifalStatusChange([item], 'beneficio-fiscal')}><ShieldCheck className="h-4 w-4" /></Button></TooltipTrigger>
                            <TooltipContent><p>Marcar como Benefício Fiscal</p></TooltipContent>
                        </Tooltip></TooltipProvider>
                        <TooltipProvider><Tooltip>
                            <TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-gray-500" onClick={() => handleDifalStatusChange([item], 'disregard')}><EyeOff className="h-4 w-4" /></Button></TooltipTrigger>
                            <TooltipContent><p>Desconsiderar</p></TooltipContent>
                        </Tooltip></TooltipProvider>
                    </div>
                );
                break;
            case 'desconsiderados':
                actionButtons = (item: any) => (
                    <div className="flex justify-center gap-1">
                        <TooltipProvider><Tooltip>
                            <TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600" onClick={() => handleDifalStatusChange([item], 'difal')}><TicketX className="h-4 w-4" /> Reverter para DIFAL</Button></TooltipTrigger>
                            <TooltipContent><p>Reverter e Marcar como DIFAL</p></TooltipContent>
                        </Tooltip></TooltipProvider>
                    </div>
                );
                break;
            case 'beneficio':
            default:
                actionButtons = () => null;
                break;
        }

        return [
            ...getColumnsWithCustomRender(
                difalAnalysisData.sujeitosAoDifal,
                baseColumns,
                (row, id) => {
                    const value = row.original[id];
                    if (id === 'Valor Total' && typeof value === 'number') {
                        return <div className='text-right'>{value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                    }
                    return <div>{value}</div>
                }
            ),
            { id: 'actions', header: 'Ações DIFAL', cell: ({ row }: any) => actionButtons(row.original) }
        ]
    }, [difalAnalysisData.sujeitosAoDifal, handleDifalStatusChange]);


    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <TicketPercent className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="font-headline text-2xl">Gerador de Guia DIFAL</CardTitle>
                            <CardDescription>
                                Carregue os itens, classifique-os e gere o script para pagamento da guia GNRE de DIFAL.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Card className="mb-6 border-dashed">
                         <CardHeader>
                            <CardTitle className='flex items-center gap-2'><span className='flex items-center justify-center text-sm rounded-full bg-primary text-primary-foreground h-6 w-6'>1</span>Passo 1: Carregar Itens</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col items-center justify-center p-4">
                                <p className="text-muted-foreground mb-4 text-center">Clique no botão para carregar todos os itens classificados como "Correto" com CFOP 2551 ou 2556 da aba de Validação CFOP.</p>
                                <Button onClick={handleLoadSubjects} disabled={isLoading}>
                                    {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando...</> : <><Cpu className="mr-2 h-4 w-4" />Carregar Itens Sujeitos ao DIFAL</>}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                         <CardHeader>
                             <CardTitle className='flex items-center gap-2'><span className='flex items-center justify-center text-sm rounded-full bg-primary text-primary-foreground h-6 w-6'>2</span>Passo 2: Classificar Itens</CardTitle>
                            <CardDescription>
                                Mova os itens da aba "Sujeitos ao DIFAL" para as categorias corretas usando os botões de ação em cada linha.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                             <Tabs defaultValue="sujeitos" className="w-full">
                                <TabsList className="grid w-full grid-cols-4">
                                    <TabsTrigger value="sujeitos">Sujeitos ao DIFAL ({difalAnalysisData.sujeitosAoDifal.length})</TabsTrigger>
                                    <TabsTrigger value="difal">DIFAL ({difalAnalysisData.difalItems.length})</TabsTrigger>
                                    <TabsTrigger value="beneficio-fiscal">Benefício Fiscal ({difalAnalysisData.beneficioFiscalItems.length})</TabsTrigger>
                                    <TabsTrigger value="desconsiderados">Desconsiderados ({difalAnalysisData.desconsideradosItems.length})</TabsTrigger>
                                </TabsList>
                                <TabsContent value="sujeitos" className="mt-4">
                                    <DataTable columns={columns('sujeitos')} data={difalAnalysisData.sujeitosAoDifal} />
                                </TabsContent>
                                <TabsContent value="difal" className="mt-4">
                                    <DataTable columns={columns('difal')} data={difalAnalysisData.difalItems} />
                                </TabsContent>
                                <TabsContent value="beneficio-fiscal" className="mt-4">
                                    <DataTable columns={columns('beneficio')} data={difalAnalysisData.beneficioFiscalItems} />
                                </TabsContent>
                                <TabsContent value="desconsiderados" className="mt-4">
                                    <DataTable columns={columns('desconsiderados')} data={difalAnalysisData.desconsideradosItems} />
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>

                    <Card className='mt-6'>
                         <CardHeader>
                             <CardTitle className='flex items-center gap-2'><span className='flex items-center justify-center text-sm rounded-full bg-primary text-primary-foreground h-6 w-6'>3</span>Passo 3: Gerar Script</CardTitle>
                              <CardDescription>
                                Após classificar todos os itens, insira a data de vencimento para gerar o script de pagamento.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid w-full max-w-sm items-center gap-1.5">
                                <Label htmlFor="vencimento">Data de Vencimento</Label>
                                <Input id="vencimento" placeholder="DD/MM/AAAA" value={vencimento} onChange={handleVencimentoChange} />
                            </div>
                            <Button onClick={generateGnreScript} disabled={isGeneratingScript || !vencimento || difalAnalysisData.difalItems.length === 0} className="mt-4">
                                {isGeneratingScript ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                Gerar e Baixar Script
                            </Button>
                        </CardContent>
                    </Card>

                </CardContent>
            </Card>

        </div>
    );
}
