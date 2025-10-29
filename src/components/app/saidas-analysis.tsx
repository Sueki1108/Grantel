"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { FileWarning, TrendingUp, XCircle, Trash2, Ban, FolderClosed, CheckCircle, Save, AlertTriangle, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";


type SaidaStatus = 'emitida' | 'cancelada' | 'inutilizada';

interface SaidaItem {
    numero: number;
    status: SaidaStatus;
    data?: any; // Original data from the sheet
    isGap?: boolean;
}

interface SaidasAnalysisProps {
    saidasData: any[];
    statusMap: Record<number, SaidaStatus>;
    onStatusChange: (newStatus: Record<number, SaidaStatus>) => void;
    lastPeriodNumber: number;
    onLastPeriodNumberChange: (newNumber: number) => void;
}

export function SaidasAnalysis({ saidasData, statusMap, onStatusChange, lastPeriodNumber, onLastPeriodNumberChange }: SaidasAnalysisProps) {
    const { toast } = useToast();
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
                fullSequence.push({ numero: i, status: finalStatus, data: existingNote });
            } else {
                fullSequence.push({ numero: i, status: savedStatus || 'inutilizada', isGap: true });
            }
        }
        
        return { sequence: fullSequence, min, max, firstNoteAfterGap };
    }, [saidasData, statusMap, lastPeriodNumber]);

    const handleStatusChange = (numero: number, newStatus: SaidaStatus) => {
        const newStatusMap = { ...statusMap, [numero]: newStatus };
        onStatusChange(newStatusMap); // Notify parent
        toast({
            title: 'Status Alterado',
            description: `A nota número ${numero} foi marcada como ${newStatus}. O estado será guardado.`,
        });
    };

    const handleClearStatus = () => {
        onStatusChange({}); // Notify parent
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

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex items-center gap-3">
                         <TrendingUp className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="font-headline text-2xl">Análise de Sequência de Notas de Saída</CardTitle>
                            <CardDescription>
                                Verifique a sequência numérica das notas fiscais de saída para identificar falhas.
                                {analysisResults.sequence.length > 0 && ` Analisando do número ${analysisResults.sequence[0].numero} ao ${analysisResults.sequence[analysisResults.sequence.length - 1].numero}.`}
                            </CardDescription>
                        </div>
                    </div>
                     <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                        <Button onClick={handleClearStatus} variant="destructive" size="sm">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Limpar Status
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <Card className="bg-muted/50">
                        <CardHeader className='pb-2'>
                            <CardTitle className='text-lg'>Período Anterior</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-2">
                                <Label htmlFor="last-note-input" className="whitespace-nowrap text-sm font-medium">Última NF do Período:</Label>
                                <Input
                                    id="last-note-input"
                                    type="number"
                                    value={lastNumberInput}
                                    onChange={(e) => setLastNumberInput(e.target.value)}
                                    className="w-32"
                                    placeholder="Ex: 11498"
                                />
                                <Button onClick={handleSaveLastNumber} size="sm"><Save className="mr-2 h-4 w-4"/> Guardar</Button>
                            </div>
                        </CardContent>
                    </Card>
                     <Card className="bg-muted/50">
                        <CardHeader className='pb-2'>
                            <CardTitle className='text-lg'>Marcar Intervalo Inutilizado</CardTitle>
                        </CardHeader>
                        <CardContent>
                             <div className="flex items-center gap-2">
                                <Label htmlFor="range-start-input" className="text-sm font-medium">De:</Label>
                                <Input
                                    id="range-start-input"
                                    type="number"
                                    value={rangeStart}
                                    onChange={(e) => setRangeStart(e.target.value)}
                                    className="w-28"
                                    placeholder="Início"
                                />
                                 <Label htmlFor="range-end-input" className="text-sm font-medium">Até:</Label>
                                 <Input
                                    id="range-end-input"
                                    type="number"
                                    value={rangeEnd}
                                    onChange={(e) => setRangeEnd(e.target.value)}
                                    className="w-28"
                                    placeholder="Fim"
                                />
                                <Button onClick={handleMarkRangeAsUnused} size="sm" variant="secondary"><Ban className="mr-2 h-4 w-4"/> Marcar</Button>
                            </div>
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
                    <div className="overflow-x-auto rounded-lg border">
                        <TooltipProvider>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[120px]">Número</TableHead>
                                        <TableHead className="w-[150px]">Status</TableHead>
                                        <TableHead>Destinatário</TableHead>
                                        <TableHead>Data de Emissão</TableHead>
                                        <TableHead className="text-right">Valor</TableHead>
                                        <TableHead className="w-[150px] text-center">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {analysisResults.sequence.map((item) => (
                                        <TableRow key={item.numero} className={item.isGap ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}>
                                            <TableCell className="font-medium">{item.numero}</TableCell>
                                            <TableCell>
                                                <Badge variant={getStatusVariant(item.status)} className="flex items-center gap-2">
                                                    {getStatusIcon(item)}
                                                    <span className="capitalize">{getStatusText(item)}</span>
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{item.data?.['Destinatário'] || '---'}</TableCell>
                                            <TableCell>
                                                {item.data?.['Emissão'] ? format(new Date(item.data['Emissão']), 'dd/MM/yyyy HH:mm') : '---'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {typeof item.data?.['Total'] === 'number' ? item.data['Total'].toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '---'}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    {item.status !== 'cancelada' && (
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStatusChange(item.numero, 'cancelada')}>
                                                                    <XCircle className="h-4 w-4" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p>Marcar Cancelada</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    )}
                                                    {item.status !== 'inutilizada' && (
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStatusChange(item.numero, 'inutilizada')}>
                                                                    <Ban className="h-4 w-4" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p>Marcar Inutilizada</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    )}
                                                    {item.status !== 'emitida' && !item.isGap && (
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStatusChange(item.numero, 'emitida')}>
                                                                    <RotateCcw className="h-4 w-4" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p>Reverter para Emitida</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TooltipProvider>
                    </div>
                ) : (
                    <div className="p-8 text-center text-muted-foreground"><FolderClosed className="mx-auto h-12 w-12 mb-4" /><h3 className="text-xl font-semibold mb-2">Nenhum dado de saída</h3><p>Os dados de notas de saída da primeira etapa aparecerão aqui para análise.</p></div>
                )}
            </CardContent>
        </Card>
    );
}
