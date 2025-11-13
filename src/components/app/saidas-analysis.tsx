
"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { FileWarning, TrendingUp, XCircle, Trash2, Ban, FolderClosed, CheckCircle, Save, AlertTriangle, RotateCcw, Settings2, ListFilter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DataTable } from './data-table';
import { ColumnDef } from '@tanstack/react-table';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { cfopDescriptions } from '@/lib/cfop';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { ScrollArea } from '../ui/scroll-area';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { SaidaItem, SaidaStatus } from '@/lib/types';


interface SaidasAnalysisProps {
    saidasData: any[];
    statusMap: Record<number, SaidaStatus>;
    onStatusChange: (newStatus: Record<number, SaidaStatus>) => void;
    lastPeriodNumber: number;
    onLastPeriodNumberChange: (newNumber: number) => void;
}

export function SaidasAnalysis({ saidasData, statusMap, onStatusChange, lastPeriodNumber, onLastPeriodNumberChange }: SaidasAnalysisProps) {
    const { toast } = useToast();
    const [cfopFilter, setCfopFilter] = useState<Set<string>>(new Set());
    const [isCfopModalOpen, setIsCfopModalOpen] = useState(false);
    const [lastNumberInput, setLastNumberInput] = useState<string>(String(lastPeriodNumber || ''));
    const [rangeStart, setRangeStart] = useState('');
    const [rangeEnd, setRangeEnd] = useState('');

    useEffect(() => {
        setLastNumberInput(String(lastPeriodNumber || ''));
    }, [lastPeriodNumber]);

    const handleSaveLastNumber = () => {
        const num = parseInt(lastNumberInput, 10);
        if (!isNaN(num)) {
            onLastPeriodNumberChange(num);
            toast({
                title: 'Número Salvo',
                description: `O número da última nota do período anterior foi salvo como ${num}.`,
            });
        } else {
            toast({
                variant: 'destructive',
                title: 'Número Inválido',
                description: 'Por favor, insira um número válido.',
            });
        }
    };
    
    const analysisResults = useMemo(() => {
        if (!saidasData || saidasData.length === 0) {
            return { sequence: [], min: 0, max: 0, firstNoteAfterGap: null };
        }

        const numericData = saidasData.map(d => ({ ...d, 'Número': parseInt(d['Número'], 10) }))
                                     .filter(d => !isNaN(d['Número']));

        if (numericData.length === 0) {
            return { sequence: [], min: 0, max: 0, firstNoteAfterGap: null };
        }

        numericData.sort((a, b) => a['Número'] - b['Número']);
        
        let min = numericData[0]['Número'];
        const max = numericData[numericData.length - 1]['Número'];

        let firstNoteAfterGap: number | null = null;
        if (lastPeriodNumber > 0 && min > lastPeriodNumber + 1) {
            firstNoteAfterGap = min;
        }

        const startSequence = lastPeriodNumber > 0 ? lastPeriodNumber + 1 : min;

        const fullSequence: SaidaItem[] = [];
        const existingNotes = new Map(numericData.map(d => [d['Número'], d]));

        for (let i = startSequence; i <= max; i++) {
            const existingNote = existingNotes.get(i);
            const savedStatus = statusMap[i];

            if (existingNote) {
                const isXmlCancelled = existingNote['Status']?.toLowerCase() === 'canceladas';
                const finalStatus = savedStatus || (isXmlCancelled ? 'cancelada' : 'emitida');
                fullSequence.push({
                    numero: i,
                    status: finalStatus,
                    data: existingNote,
                    'Destinatário': existingNote['Destinatário'],
                    'Emissão': existingNote['Emissão'],
                    'CFOP': existingNote['CFOP'],
                    'Base ICMS': existingNote['Base ICMS'],
                    'Alíq. ICMS (%)': existingNote['Alíq. ICMS (%)'],
                    'Valor ICMS': existingNote['Valor ICMS'],
                    'Total': existingNote['Total'],
                });
            } else {
                fullSequence.push({ numero: i, status: savedStatus || 'inutilizada', isGap: true });
            }
        }
        
        return { sequence: fullSequence, min, max, firstNoteAfterGap };
    }, [saidasData, statusMap, lastPeriodNumber]);
    
    const filteredSequence = useMemo(() => {
        if (cfopFilter.size === 0) {
            return analysisResults.sequence;
        }
        return analysisResults.sequence.filter(item => {
            if (item.isGap) return true; // Always show gaps
            return item.CFOP && cfopFilter.has(item.CFOP);
        });
    }, [analysisResults.sequence, cfopFilter]);

    const icmsSummaryByCfop = useMemo(() => {
        const summary: { [cfop: string]: { base: number, valor: number, aliquota: number, count: number, description: string } } = {};

        analysisResults.sequence.forEach(item => {
            if (item.data && item.status === 'emitida' && item.CFOP && (item.data['Base ICMS'] > 0 || item.data['Valor ICMS'] > 0)) {
                if (!summary[item.CFOP]) {
                    summary[item.CFOP] = { base: 0, valor: 0, aliquota: item.data['Alíq. ICMS (%)'] || 0, count: 0, description: cfopDescriptions[parseInt(item.CFOP, 10) as keyof typeof cfopDescriptions] || "Descrição não encontrada" };
                }
                summary[item.CFOP].base += item.data['Base ICMS'] || 0;
                summary[item.CFOP].valor += item.data['Valor ICMS'] || 0;
                summary[item.CFOP].count += 1;
            }
        });

        return Object.entries(summary).map(([cfop, data]) => ({ cfop, ...data }));
    }, [analysisResults.sequence]);

    const allCfops = useMemo(() => {
        const cfops = new Set<string>();
        analysisResults.sequence.forEach(item => {
            if (item.CFOP) cfops.add(item.CFOP);
        });
        return Array.from(cfops).sort();
    }, [analysisResults.sequence]);
    
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


    const handleStatusChange = (numero: number, newStatus: SaidaStatus) => {
        const newStatusMap = { ...statusMap, [numero]: newStatus };
        onStatusChange(newStatusMap);
        toast({
            title: 'Status Alterado',
            description: `A nota número ${numero} foi marcada como ${newStatus}. O estado será guardado.`,
        });
    };

    const handleClearStatus = () => {
        onStatusChange({});
        toast({
            title: 'Classificações Limpas',
            description: 'Todos os status manuais das notas de saída foram removidos.',
        });
    };

    const handleMarkRangeAsUnused = () => {
        const start = parseInt(rangeStart, 10);
        const end = parseInt(rangeEnd, 10);

        if (isNaN(start) || isNaN(end) || start <= 0 || end <= 0) {
            toast({ variant: 'destructive', title: 'Intervalo Inválido', description: 'Por favor, insira números de início e fim válidos.' });
            return;
        }
        if (start > end) {
            toast({ variant: 'destructive', title: 'Intervalo Inválido', description: 'O número inicial deve ser menor ou igual ao final.' });
            return;
        }

        const newStatusMap = { ...statusMap };
        let count = 0;
        for (let i = start; i <= end; i++) {
            newStatusMap[i] = 'inutilizada';
            count++;
        }

        onStatusChange(newStatusMap);

        toast({
            title: 'Intervalo Marcado como Inutilizado',
            description: `${count} notas de ${start} a ${end} foram marcadas.`
        });
        setRangeStart('');
        setRangeEnd('');
    };
    
    const getStatusVariant = (status: SaidaStatus): "default" | "destructive" | "secondary" => {
        switch (status) {
            case 'emitida': return 'default';
            case 'cancelada': return 'destructive';
            case 'inutilizada': return 'secondary';
        }
    };
    
    const getStatusIcon = (item: SaidaItem) => {
        if (item.status === 'inutilizada' && item.isGap) {
            return <FileWarning className="h-5 w-5 text-yellow-600" />;
        }
        switch (item.status) {
            case 'emitida': return <CheckCircle className="h-5 w-5 text-green-600" />;
            case 'cancelada': return <XCircle className="h-5 w-5 text-red-600" />;
            case 'inutilizada': return <Ban className="h-5 w-5 text-slate-600" />;
        }
    };
    
    const getStatusText = (item: SaidaItem): string => {
        if (item.status === 'inutilizada' && item.isGap) {
            return 'Intervalo';
        }
        return item.status.charAt(0).toUpperCase() + item.status.slice(1);
    };

    const columns: ColumnDef<SaidaItem>[] = [
        { accessorKey: 'numero', header: 'Número' },
        { 
            accessorKey: 'status', 
            header: 'Status',
            cell: ({ row }) => (
                <Badge variant={getStatusVariant(row.original.status)} className="flex items-center gap-2">
                    {getStatusIcon(row.original)}
                    <span className="capitalize">{getStatusText(row.original)}</span>
                </Badge>
            )
        },
        { accessorKey: 'Destinatário', header: 'Destinatário', cell: ({ row }) => row.original.data?.['Destinatário'] || '---' },
        { 
            accessorKey: 'Emissão', 
            header: 'Data de Emissão',
            cell: ({ row }) => row.original.data?.['Emissão'] ? format(parseISO(row.original.data['Emissão']), 'dd/MM/yyyy') : '---'
        },
        { accessorKey: 'CFOP', header: 'CFOP', cell: ({ row }) => row.original.data?.['CFOP'] || '---' },
        { 
            accessorKey: 'Base ICMS', 
            header: 'Base ICMS',
            cell: ({ row }) => typeof row.original.data?.['Base ICMS'] === 'number' ? row.original.data['Base ICMS'].toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '---'
        },
        { 
            accessorKey: 'Alíq. ICMS (%)', 
            header: 'Alíq. ICMS (%)',
            cell: ({ row }) => typeof row.original.data?.['Alíq. ICMS (%)'] === 'number' ? `${row.original.data['Alíq. ICMS (%)'].toFixed(2)}%` : '---'
        },
        { 
            accessorKey: 'Valor ICMS', 
            header: 'Valor ICMS',
            cell: ({ row }) => typeof row.original.data?.['Valor ICMS'] === 'number' ? row.original.data['Valor ICMS'].toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '---'
        },
        { 
            accessorKey: 'Total', 
            header: 'Valor Total',
            cell: ({ row }) => (
                <div className="text-right">
                    {typeof row.original.data?.['Total'] === 'number' ? row.original.data['Total'].toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '---'}
                </div>
            )
        },
        {
            id: 'actions',
            header: 'Ações',
            cell: ({ row }) => (
                 <div className="flex items-center justify-center gap-1">
                    {row.original.status !== 'cancelada' && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStatusChange(row.original.numero, 'cancelada')}>
                                    <XCircle className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Marcar Cancelada</p></TooltipContent>
                        </Tooltip>
                    )}
                    {row.original.status !== 'inutilizada' && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStatusChange(row.original.numero, 'inutilizada')}>
                                    <Ban className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Marcar Inutilizada</p></TooltipContent>
                        </Tooltip>
                    )}
                    {row.original.status !== 'emitida' && !row.original.isGap && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStatusChange(row.original.numero, 'emitida')}>
                                    <RotateCcw className="h-4 w-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent><p>Reverter para Emitida</p></TooltipContent>
                        </Tooltip>
                    )}
                </div>
            )
        }
    ];

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex items-center gap-3">
                         <TrendingUp className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="font-headline text-2xl">Análise de Sequência de Notas de Saída</CardTitle>
                            <CardDescription>
                                Verifique a sequência numérica das notas fiscais de saída, analise os totais de ICMS e filtre por CFOP.
                                {lastPeriodNumber > 0 && ` A última nota do período anterior foi a ${lastPeriodNumber}.`}
                            </CardDescription>
                        </div>
                    </div>
                     <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                        <Button onClick={handleClearStatus} variant="destructive" size="sm">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Limpar Status Manuais
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <Card className="bg-muted/50">
                        <CardHeader className='pb-2'>
                            <CardTitle className='text-lg'>Configuração do Período</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="last-note-input" className="whitespace-nowrap text-sm font-medium">Última NF do Período Anterior:</Label>
                                <div className="flex items-center gap-2 mt-1">
                                    <input
                                        id="last-note-input"
                                        type="number"
                                        value={lastNumberInput}
                                        onChange={(e) => setLastNumberInput(e.target.value)}
                                        className="w-32 h-9 rounded-md border px-3"
                                        placeholder="Ex: 11498"
                                    />
                                    <Button onClick={handleSaveLastNumber} size="sm"><Save className="mr-2 h-4 w-4"/> Guardar</Button>
                                </div>
                            </div>
                             <div>
                                 <Label className="text-sm font-medium">Marcar Intervalo Inutilizado:</Label>
                                 <div className="flex items-center gap-2 mt-1">
                                    <input
                                        id="range-start-input"
                                        type="number"
                                        value={rangeStart}
                                        onChange={(e) => setRangeStart(e.target.value)}
                                        className="w-28 h-9 rounded-md border px-3"
                                        placeholder="Início"
                                    />
                                    <input
                                        id="range-end-input"
                                        type="number"
                                        value={rangeEnd}
                                        onChange={(e) => setRangeEnd(e.target.value)}
                                        className="w-28 h-9 rounded-md border px-3"
                                        placeholder="Fim"
                                    />
                                    <Button onClick={handleMarkRangeAsUnused} size="sm" variant="secondary"><Ban className="mr-2 h-4 w-4"/> Marcar</Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-muted/50">
                          <CardHeader className='pb-2'>
                            <CardTitle className='text-lg'>Resumo de ICMS por CFOP</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {icmsSummaryByCfop.length > 0 ? (
                                <ScrollArea className="h-32">
                                     <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0">
                                            <tr>
                                                <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground uppercase">CFOP</th>
                                                <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Base de Cálculo</th>
                                                <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Valor do ICMS</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-transparent divide-y divide-gray-200 dark:divide-gray-700">
                                            {icmsSummaryByCfop.map(({ cfop, base, valor }) => (
                                                <tr key={cfop}>
                                                    <td className="px-2 py-2 whitespace-nowrap text-sm font-medium">{cfop}</td>
                                                    <td className="px-2 py-2 whitespace-nowrap text-sm text-right">{base.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                                    <td className="px-2 py-2 whitespace-nowrap text-sm text-right">{valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </ScrollArea>
                            ) : (<p className="text-sm text-muted-foreground text-center pt-8">Nenhuma nota com ICMS destacado para resumir.</p>)}
                        </CardContent>
                    </Card>
                </div>


                {analysisResults.firstNoteAfterGap && (
                    <Alert variant="destructive" className="mb-4">
                        <AlertTriangle className="h-4 w-4" />
                        <CardTitle>Alerta de Falha na Sequência</CardTitle>
                        <AlertDescription>
                            A última nota do período anterior foi <strong>{lastPeriodNumber}</strong>, mas a primeira nota deste período é <strong>{analysisResults.firstNoteAfterGap}</strong>. Verifique as notas em falta no intervalo.
                        </AlertDescription>
                    </Alert>
                )}

                {analysisResults.sequence.length > 0 ? (
                    <TooltipProvider>
                        <div className='flex justify-end mb-4'>
                            <Dialog open={isCfopModalOpen} onOpenChange={setIsCfopModalOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline"><ListFilter className="mr-2 h-4 w-4" />Filtrar por CFOP ({cfopFilter.size > 0 ? cfopFilter.size : 'Todos'})</Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Filtrar por CFOP</DialogTitle>
                                        <DialogDescription>Selecione os CFOPs que deseja visualizar na tabela. Se nada for selecionado, todos serão exibidos.</DialogDescription>
                                    </DialogHeader>
                                    <div className='flex gap-2 my-2'>
                                        <Button size="sm" variant="secondary" onClick={() => setCfopFilter(new Set(allCfops))}>Selecionar Todos</Button>
                                        <Button size="sm" variant="secondary" onClick={() => setCfopFilter(new Set())}>Limpar Seleção</Button>
                                    </div>
                                    <ScrollArea className='h-72 border rounded-md p-4'>
                                        <div className='grid grid-cols-2 gap-4'>
                                            {allCfops.map(cfop => (
                                                <div key={cfop} className="flex items-center space-x-2">
                                                    <Checkbox
                                                        id={`cfop-${cfop}`}
                                                        checked={cfopFilter.has(cfop)}
                                                        onCheckedChange={(checked) => handleCfopFilterChange(cfop, !!checked)}
                                                    />
                                                    <Label htmlFor={`cfop-${cfop}`}>{cfop}</Label>
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                    <DialogFooter>
                                        <Button onClick={() => setIsCfopModalOpen(false)}>Aplicar</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                        <DataTable
                            columns={columns}
                            data={filteredSequence}
                        />
                    </TooltipProvider>
                ) : (
                    <div className="p-8 text-center text-muted-foreground"><FolderClosed className="mx-auto h-12 w-12 mb-4" /><h3 className="text-xl font-semibold mb-2">Nenhum dado de saída</h3><p>Os dados de notas de saída da primeira etapa aparecerão aqui para análise.</p></div>
                )}
            </CardContent>
        </Card>
    );
}
