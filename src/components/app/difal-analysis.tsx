
"use client";

import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Loader2, Download, Cpu, TicketPercent, Copy, Calendar as CalendarIcon, Hash, Sigma, Coins, ClipboardCopy, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DataTable } from '@/components/app/data-table';
import { getColumnsWithCustomRender } from "@/components/app/columns-helper";
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogClose } from '../ui/dialog';
import { generateGnreScript, GNRE_DEFAULT_CONFIGS } from '@/lib/gnre-script-generator';

// ===============================================================
// Tipos
// ===============================================================
type DifalDataItem = {
    'Chave de Acesso': string;
    'Número da Nota': string;
    'Data de Emissão': string;
    'Valor Total da Nota': number;
    'Valor da Guia (11%)': number;
    'Entrega': string;
};

interface DifalAnalysisProps {
    difalItems: any[];
}


// ===============================================================
// Main Component
// ===============================================================
export function DifalAnalysis({ difalItems }: DifalAnalysisProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);
    const [dueDate, setDueDate] = useState<Date | undefined>(new Date());
    const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());
    const { toast } = useToast();

    const processItems = async () => {
        if (difalItems.length === 0) {
            toast({ variant: "destructive", title: "Nenhum item DIFAL", description: "Nenhum item foi classificado como DIFAL para processar." });
            return;
        }
        setIsLoading(true);
        // Simulate processing, as data is already filtered
        await new Promise(resolve => setTimeout(resolve, 300));
        setIsLoading(false);
        setIsResultsModalOpen(true);
        toast({ title: "Itens DIFAL Carregados", description: `${difalItems.length} itens prontos para geração de guia.` });
    };

    const totals = useMemo(() => {
        if (difalItems.length === 0) return null;
        const totalNotesValue = difalItems.reduce((sum, item) => sum + item['Valor Total'], 0);
        return {
            count: difalItems.length,
            totalNotesValue,
            totalGuideValue: totalNotesValue * 0.11,
        }
    }, [difalItems]);
    
    const handleDownloadExcel = () => {
        if (difalItems.length === 0) {
            toast({ variant: 'destructive', title: 'Nenhum dado para exportar' });
            return;
        }

        const dataToExport = difalItems.map(item => ({
            'Chave de Acesso': item['Chave de acesso'],
            'Número da Nota': item['Número da Nota'],
            'Data de Emissão': item['Emissão'] ? format(parseISO(item['Emissão']), 'dd/MM/yyyy') : 'N/A',
            'Valor Total da Nota': item['Valor Total'],
            'Valor da Guia (11%)': parseFloat((item['Valor Total'] * 0.11).toFixed(2)),
            'Entrega': item.destUF,
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Dados DIFAL');
        XLSX.writeFile(workbook, `Relatorio_DIFAL.xlsx`);
        toast({ title: 'Relatório Excel Gerado' });
    };

    const handleGenerateScript = () => {
        if (difalItems.length === 0 || !dueDate || !paymentDate) {
            toast({ variant: 'destructive', title: 'Dados incompletos', description: 'Certifique-se de que há itens DIFAL e que as datas estão preenchidas.' });
            return;
        }
    
        const scriptData = difalItems.map(item => ({
            filename: `nota_${item['Número da Nota']}.xml`,
            chave_acesso: item['Chave de acesso'],
            valor_principal_calculado: item['Valor Total'] * 0.11,
            valor_principal_gnre: (item['Valor Total'] * 0.11).toFixed(2).replace('.', ','),
        }));
    
        const scriptContent = generateGnreScript(
            scriptData,
            format(dueDate, 'ddMMyyyy'),
            format(paymentDate, 'ddMMyyyy'),
            GNRE_DEFAULT_CONFIGS
        );
        
        const blob = new Blob([scriptContent], { type: 'text/python' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'gerar_guias_gnre.py';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    
        toast({ title: "Script Python Gerado", description: "Execute o script 'gerar_guias_gnre.py' para automatizar a criação das guias." });
    };

    const copyToClipboard = (text: string | number) => {
        const textToCopy = typeof text === 'number' ? text.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\./g, '').replace(',', '.') : text;
        navigator.clipboard.writeText(textToCopy).then(() => {
            toast({ title: 'Copiado!', description: `Valor "${textToCopy}" copiado para a área de transferência.` });
        }).catch(err => {
            toast({ variant: 'destructive', title: 'Falha ao copiar', description: 'Não foi possível copiar o valor.' });
        });
    };

    const columns = useMemo(() => getColumnsWithCustomRender(
        difalItems, 
        ['Número da Nota', 'Chave de acesso', 'Emissão', 'Valor Total', 'Valor da Guia (11%)'],
        (row, id) => {
            const item = row.original;
            const value = item[id as keyof typeof item];
            let displayValue: React.ReactNode = String(value ?? '');
            
             if (id === 'Emissão' && typeof value === 'string') {
                displayValue = format(parseISO(value), 'dd/MM/yyyy');
             } else if (typeof value === 'number') {
                displayValue = value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
             } else if (id === 'Valor da Guia (11%)') {
                 const guideValue = (item['Valor Total'] || 0) * 0.11;
                 displayValue = guideValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
             }
             
             return (
                <div className="cursor-pointer hover:bg-muted p-1 rounded group flex items-center gap-1 justify-between" onClick={() => copyToClipboard(String(value))}>
                    <span>{displayValue}</span>
                </div>
             )
        }
    ), [difalItems]);


    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <TicketPercent className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="font-headline text-2xl">Ferramenta de Extração para Guia DIFAL</CardTitle>
                            <CardDescription>
                                Esta aba exibe os itens que foram marcados como DIFAL. Defina as datas e gere o script de automação.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-8">
                    <div>
                        <h3 className="text-lg font-bold mb-4">Etapa 1: Definir Datas</h3>
                         <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                            <div>
                                <Label htmlFor='due-date'>Data de Vencimento da Guia</Label>
                                <div className="flex items-center gap-2">
                                     <Popover>
                                        <PopoverTrigger asChild>
                                            <Button id="due-date" variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dueDate && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {dueDate ? format(dueDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : <span>Selecione uma data</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus /></PopoverContent>
                                    </Popover>
                                     <Button size="icon" variant="ghost" onClick={() => copyToClipboard(dueDate ? format(dueDate, 'dd/MM/yyyy') : '')} disabled={!dueDate}><ClipboardCopy className="h-6 w-6" /></Button>
                                </div>
                            </div>
                             <div>
                                <Label htmlFor='payment-date'>Data de Pagamento da Guia</Label>
                                <div className="flex items-center gap-2">
                                     <Popover>
                                        <PopoverTrigger asChild>
                                            <Button id="payment-date" variant={"outline"} className={cn("w-full justify-start text-left font-normal", !paymentDate && "text-muted-foreground")}>
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {paymentDate ? format(paymentDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : <span>Selecione uma data</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={paymentDate} onSelect={setPaymentDate} initialFocus /></PopoverContent>
                                    </Popover>
                                     <Button size="icon" variant="ghost" onClick={() => copyToClipboard(paymentDate ? format(paymentDate, 'dd/MM/yyyy') : '')} disabled={!paymentDate}><ClipboardCopy className="h-6 w-6" /></Button>
                                </div>
                            </div>
                        </div>
                    </div>
                     <div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Etapa 2</span></div></div>
                     <div>
                        <h3 className="text-lg font-bold mb-2">Etapa 2: Processar e Exportar</h3>
                         <p className='text-sm text-muted-foreground mb-4'>Clique para visualizar os itens e gerar os relatórios.</p>
                        <div className='flex flex-col sm:flex-row gap-4'>
                            <Button onClick={processItems} disabled={isLoading || difalItems.length === 0} className="w-full">
                                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Processando...</> : <><Cpu className="mr-2 h-4 w-4" /> Visualizar Itens DIFAL</>}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

             {totals && (
                <Card>
                    <CardHeader>
                        <CardTitle>Resumo da Análise</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">Total de Notas</CardTitle>
                                    <Hash className="h-6 w-6 text-muted-foreground" />
                                </CardHeader>
                                <CardContent className='flex items-end justify-between'>
                                    <div className="text-4xl font-bold">{totals.count}</div>
                                    <Button size="icon" variant="ghost" onClick={() => copyToClipboard(totals.count)}><ClipboardCopy className="h-6 w-6" /></Button>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">Valor Total das Notas</CardTitle>
                                    <Sigma className="h-6 w-6 text-muted-foreground" />
                                </CardHeader>
                                <CardContent className='flex items-end justify-between'>
                                    <div className="text-4xl font-bold">{totals.totalNotesValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                                    <Button size="icon" variant="ghost" onClick={() => copyToClipboard(totals.totalNotesValue)}><ClipboardCopy className="h-6 w-6" /></Button>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">Valor Total Guias (11%)</CardTitle>
                                    <Coins className="h-6 w-6 text-muted-foreground" />
                                </CardHeader>
                                <CardContent className='flex items-end justify-between'>
                                    <div className="text-4xl font-bold">{totals.totalGuideValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                                    <Button size="icon" variant="ghost" onClick={() => copyToClipboard(totals.totalGuideValue)}><ClipboardCopy className="h-6 w-6" /></Button>
                                </CardContent>
                            </Card>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Dialog open={isResultsModalOpen} onOpenChange={setIsResultsModalOpen}>
                <DialogContent className="max-w-4xl h-auto max-h-[90vh] flex flex-col">
                     <DialogHeader>
                        <DialogTitle>Itens Marcados como DIFAL</DialogTitle>
                        <DialogDescription>
                            Os dados foram extraídos dos itens marcados. Clique num valor para o copiar.
                        </DialogDescription>
                    </DialogHeader>
                    
                    {difalItems.length > 0 && (
                        <Card className="flex-grow overflow-hidden">
                            <CardContent className='pt-6 h-full'>
                            <DataTable 
                                columns={columns}
                                data={difalItems}
                            />
                            </CardContent>
                        </Card>
                    )}
                    <DialogFooter>
                         <Button onClick={handleDownloadExcel} disabled={difalItems.length === 0} variant="outline">
                            <Download className="mr-2 h-4 w-4" /> Baixar Excel
                        </Button>
                         <Button onClick={handleGenerateScript} disabled={difalItems.length === 0}>
                            <Download className="mr-2 h-4 w-4" /> Gerar Script Python
                        </Button>
                    </DialogFooter>
                     <DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                        <X className="h-4 w-4" />
                        <span className="sr-only">Close</span>
                    </DialogClose>
                </DialogContent>
            </Dialog>

        </div>
    );
}
