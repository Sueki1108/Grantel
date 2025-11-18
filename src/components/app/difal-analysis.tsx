
"use client";

import { useState, useMemo, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Loader2, Download, Cpu, TicketPercent, Copy, Calendar as CalendarIcon, Hash, Sigma, Coins, ClipboardCopy, X, FileUp, UploadCloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DataTable } from '@/components/app/data-table';
import { getColumnsWithCustomRender } from "@/components/app/columns-helper";
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '../ui/dialog';
import { generateGnreScript, GNRE_DEFAULT_CONFIGS } from '@/lib/gnre-script-generator';
import { processUploadedXmls } from '@/lib/xml-processor';
import JSZip from 'jszip';
import { FileUploadForm } from './file-upload-form';


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


// ===============================================================
// Componente Principal
// ===============================================================
export function DifalAnalysis() {
    const [isLoading, setIsLoading] = useState(false);
    const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);
    const [dueDate, setDueDate] = useState<Date | undefined>(new Date());
    const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());
    const [difalXmlFiles, setDifalXmlFiles] = useState<File[]>([]);
    const [processedItems, setProcessedItems] = useState<DifalDataItem[]>([]);
    
    const { toast } = useToast();

    const handleXmlFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (!selectedFiles) return;

        const newFiles: File[] = [];
        let extractedCount = 0;

        for (const file of Array.from(selectedFiles)) {
            if (file.type === 'application/zip' || file.name.toLowerCase().endsWith('.zip')) {
                try {
                    const zip = await JSZip.loadAsync(file);
                    const xmlFilePromises: Promise<File>[] = [];
                    zip.forEach((relativePath, zipEntry) => {
                        if (!zipEntry.dir && relativePath.toLowerCase().endsWith('.xml')) {
                            const promise = zipEntry.async('string').then(content => new File([content], zipEntry.name, { type: 'application/xml' }));
                            xmlFilePromises.push(promise);
                        }
                    });
                    const extractedFiles = await Promise.all(xmlFilePromises);
                    newFiles.push(...extractedFiles);
                    extractedCount += extractedFiles.length;
                } catch (error) {
                    toast({ variant: "destructive", title: `Erro ao descompactar ${file.name}` });
                }
            } else if (file.type === 'text/xml' || file.name.toLowerCase().endsWith('.xml')) {
                newFiles.push(file);
            }
        }
        
        setDifalXmlFiles(prev => [...prev, ...newFiles]);
        toast({ title: "Ficheiros Adicionados", description: `${newFiles.length + extractedCount} ficheiros XML adicionados para análise DIFAL.` });
    };

    const processDifalItems = async () => {
        if (difalXmlFiles.length === 0) {
            toast({ variant: "destructive", title: "Nenhum XML carregado", description: "Carregue os ficheiros XML para processar." });
            return;
        }
        setIsLoading(true);
        
        try {
            const { nfe, saidas } = await processUploadedXmls(difalXmlFiles);
            const allItems = [...nfe, ...saidas];
            
            const difalData: DifalDataItem[] = allItems
                .filter(item => item.entrega_UF && item.entrega_UF !== item.destUF) // Lógica simplificada de DIFAL
                .map(item => ({
                    'Chave de Acesso': item['Chave de acesso'],
                    'Número da Nota': item['Número'],
                    'Data de Emissão': item['Emissão'],
                    'Valor Total da Nota': item['Total'],
                    'Valor da Guia (11%)': parseFloat((item['Total'] * 0.11).toFixed(2)),
                    'Entrega': item.entrega_UF,
                }));

            setProcessedItems(difalData);
            setIsResultsModalOpen(true);
            toast({ title: "Análise DIFAL Concluída", description: `${difalData.length} notas elegíveis para DIFAL encontradas.` });
        } catch (err: any) {
            toast({ variant: "destructive", title: "Erro ao processar XMLs", description: err.message });
        } finally {
            setIsLoading(false);
        }
    };

    const totals = useMemo(() => {
        if (processedItems.length === 0) return null;
        const totalNotesValue = processedItems.reduce((sum, item) => sum + item['Valor Total da Nota'], 0);
        return {
            count: processedItems.length,
            totalNotesValue,
            totalGuideValue: totalNotesValue * 0.11,
        }
    }, [processedItems]);
    
    const handleDownloadExcel = () => {
        if (processedItems.length === 0) {
            toast({ variant: 'destructive', title: 'Nenhum dado para exportar' });
            return;
        }

        const dataToExport = processedItems.map(item => ({
            ...item,
            'Data de Emissão': item['Data de Emissão'] ? format(parseISO(item['Data de Emissão']), 'dd/MM/yyyy') : 'N/A',
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Dados DIFAL');
        XLSX.writeFile(workbook, `Relatorio_DIFAL.xlsx`);
        toast({ title: 'Relatório Excel Gerado' });
    };

    const handleGenerateScript = () => {
        if (processedItems.length === 0 || !dueDate || !paymentDate) {
            toast({ variant: 'destructive', title: 'Dados incompletos', description: 'Certifique-se de que processou os itens e que as datas estão preenchidas.' });
            return;
        }
    
        const scriptData = processedItems.map(item => ({
            filename: `nota_${item['Número da Nota']}.xml`,
            chave_acesso: item['Chave de Acesso'],
            valor_principal_calculado: item['Valor da Guia (11%)'],
            valor_principal_gnre: (item['Valor da Guia (11%)']).toFixed(2).replace('.', ','),
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
        processedItems, 
        ['Número da Nota', 'Chave de Acesso', 'Data de Emissão', 'Valor Total da Nota', 'Valor da Guia (11%)'],
        (row, id) => {
            const item = row.original as DifalDataItem;
            const value = item[id as keyof DifalDataItem];
            let displayValue: React.ReactNode = String(value ?? '');
            
             if (id === 'Data de Emissão' && typeof value === 'string') {
                displayValue = format(parseISO(value), 'dd/MM/yyyy');
             } else if (typeof value === 'number') {
                displayValue = value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
             }
             
             return (
                <div className="cursor-pointer hover:bg-muted p-1 rounded group flex items-center gap-1 justify-between" onClick={() => copyToClipboard(String(value))}>
                    <span>{displayValue}</span>
                </div>
             )
        }
    ), [processedItems]);


    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <TicketPercent className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="font-headline text-2xl">Ferramenta de Geração de Guia DIFAL</CardTitle>
                            <CardDescription>
                                Carregue os XMLs, defina as datas e processe para gerar o script de automação para as guias GNRE.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-8">
                     <div>
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><UploadCloud className="h-5 w-5" />Etapa 1: Carregar XMLs</h3>
                        <FileUploadForm
                            formId="xml-difal"
                            files={{ 'xml-difal': difalXmlFiles.length > 0 }}
                            onFileChange={handleXmlFileChange}
                            onClearFile={() => setDifalXmlFiles([])}
                            xmlFileCount={difalXmlFiles.length}
                            displayName="Carregar XMLs para DIFAL"
                        />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold mb-4">Etapa 2: Definir Datas</h3>
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
                     <div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Etapa Final</span></div></div>
                     <div>
                        <h3 className="text-lg font-bold mb-2">Etapa 3: Processar e Exportar</h3>
                         <p className='text-sm text-muted-foreground mb-4'>Clique para analisar os XMLs, ver os resultados e gerar os relatórios.</p>
                        <div className='flex flex-col sm:flex-row gap-4'>
                            <Button onClick={processDifalItems} disabled={isLoading || difalXmlFiles.length === 0} className="w-full">
                                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Processando...</> : <><Cpu className="mr-2 h-4 w-4" /> Processar e Gerar Guia</>}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={isResultsModalOpen} onOpenChange={setIsResultsModalOpen}>
                <DialogContent className="max-w-4xl h-auto max-h-[90vh] flex flex-col">
                     <DialogHeader>
                        <DialogTitle>Resultados da Análise DIFAL</DialogTitle>
                        <DialogDescription>
                            Os dados foram extraídos dos XMLs. Clique num valor para o copiar para a área de transferência.
                        </DialogDescription>
                    </DialogHeader>
                    
                    {totals && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-4">
                             <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total de Notas</CardTitle><Hash className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{totals.count}</div></CardContent></Card>
                             <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Valor Total das Notas</CardTitle><Sigma className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{totals.totalNotesValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div></CardContent></Card>
                             <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Valor Total Guias (11%)</CardTitle><Coins className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{totals.totalGuideValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div></CardContent></Card>
                        </div>
                    )}
                    
                    {processedItems.length > 0 && (
                        <Card className="flex-grow overflow-hidden">
                            <CardContent className='pt-6 h-full'>
                            <DataTable 
                                columns={columns}
                                data={processedItems}
                            />
                            </CardContent>
                        </Card>
                    )}
                    <DialogFooter>
                         <Button onClick={handleDownloadExcel} disabled={processedItems.length === 0} variant="outline">
                            <Download className="mr-2 h-4 w-4" /> Baixar Excel
                        </Button>
                         <Button onClick={handleGenerateScript} disabled={processedItems.length === 0}>
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
