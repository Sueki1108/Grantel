"use client";

import { useState, useMemo, type ChangeEvent } from 'react';
import XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Loader2, Download, Cpu, TicketPercent, Copy, Hash, Sigma, Coins, ClipboardCopy, X, UploadCloud } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DataTable } from '@/components/app/data-table';
import { getColumnsWithCustomRender } from "@/components/app/columns-helper";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '../ui/dialog';
import { processUploadedXmls } from '@/lib/xml-processor';
import JSZip from 'jszip';
import { FileUploadForm } from './file-upload-form';
import { Input } from '../ui/input';
import { Label } from '../ui/label';


// ===============================================================
// Tipos
// ===============================================================
type DifalDataItem = {
    'Nome da Guia': string;
    'Chave de Acesso': string;
    'Número da Nota': string;
    'Data de Emissão': string;
    'Valor Total da Nota': number;
    'Valor da Guia (10%)': number;
    'Município Entrega': string;
    'UF Entrega': string;
};


// ===============================================================
// Componente Principal
// ===============================================================
export function DifalAnalysis() {
    const [isLoading, setIsLoading] = useState(false);
    const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);
    const [difalXmlFiles, setDifalXmlFiles] = useState<File[]>([]);
    const [processedItems, setProcessedItems] = useState<DifalDataItem[]>([]);
    const [vencimento, setVencimento] = useState('');
    
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
            
            const difalData: DifalDataItem[] = allItems.map(item => {
                const date = parseISO(item['Emissão']);
                const formattedMonth = format(date, 'MMM', { locale: ptBR });
                const formattedYear = format(date, 'yyyy');
                const guideName = `Grantel - ICMS DIFAL NF ${item['Número']} - ${formattedMonth} ${formattedYear}`;

                return {
                    'Nome da Guia': guideName,
                    'Chave de Acesso': item['Chave de acesso'],
                    'Número da Nota': item['Número'],
                    'Data de Emissão': item['Emissão'],
                    'Valor Total da Nota': item['Total'],
                    'Valor da Guia (10%)': parseFloat((item['Total'] * 0.10).toFixed(2)),
                    'Município Entrega': item.entrega_Mun || 'N/A',
                    'UF Entrega': item.entrega_UF || 'N/A',
                }
            });

            setProcessedItems(difalData);
            setIsResultsModalOpen(true);
            toast({ title: "Análise DIFAL Concluída", description: `${difalData.length} notas processadas.` });
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
            totalGuideValue: totalNotesValue * 0.10,
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

    const copyToClipboard = (text: string | number) => {
        const textToCopy = typeof text === 'number' ? text.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\./g, '').replace(',', '.') : text;
        navigator.clipboard.writeText(textToCopy).then(() => {
            toast({ title: 'Copiado!', description: `Valor "${textToCopy}" copiado para a área de transferência.` });
        }).catch(err => {
            toast({ variant: 'destructive', title: 'Falha ao copiar', description: 'Não foi possível copiar o valor.' });
        });
    };
    
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

    const columns = useMemo(() => getColumnsWithCustomRender(
        processedItems, 
        ['Nome da Guia', 'Chave de Acesso', 'Data de Emissão', 'Valor Total da Nota', 'Valor da Guia (10%)', 'Município Entrega', 'UF Entrega'],
        (row, id) => {
            const item = row.original as DifalDataItem;
            const value = item[id as keyof DifalDataItem];
            let displayValue: React.ReactNode = String(value ?? '');
            
             if (id === 'Data de Emissão' && typeof value === 'string') {
                displayValue = format(parseISO(value), 'dd/MM/yyyy');
             } else if (typeof value === 'number') {
                displayValue = value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
             } else if (id === 'Nome da Guia') {
                 displayValue = <span className='font-bold'>{value}</span>
             }
             
             return (
                <div className="cursor-pointer hover:bg-muted p-1 rounded group flex items-center gap-1 justify-between" onClick={() => copyToClipboard(String(value))}>
                    <span>{displayValue}</span>
                    <ClipboardCopy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
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
                            <CardTitle className="font-headline text-2xl">Ferramenta de Extração de Dados DIFAL</CardTitle>
                            <CardDescription>
                                Carregue os XMLs, insira a data de vencimento e visualize os dados para análise de DIFAL.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-8">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                            <h3 className="text-lg font-bold mb-4">Etapa 2: Informar Vencimento</h3>
                            <div className="space-y-2">
                                <Label htmlFor="vencimento-input">Data de Vencimento da Guia</Label>
                                <Input 
                                    id="vencimento-input"
                                    placeholder="DD/MM/AAAA"
                                    value={vencimento}
                                    onChange={handleVencimentoChange}
                                    maxLength={10}
                                />
                                <p className="text-xs text-muted-foreground">Esta data será exibida no relatório final.</p>
                            </div>
                        </div>
                    </div>
                    
                     <div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Etapa Final</span></div></div>
                     <div>
                        <h3 className="text-lg font-bold mb-2">Etapa 3: Processar e Visualizar</h3>
                         <p className='text-sm text-muted-foreground mb-4'>Clique para analisar os XMLs e ver os resultados.</p>
                        <div className='flex flex-col sm:flex-row gap-4'>
                            <Button onClick={processDifalItems} disabled={isLoading || difalXmlFiles.length === 0} className="w-full">
                                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Processando...</> : <><Cpu className="mr-2 h-4 w-4" /> Processar e Ver Resultados</>}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={isResultsModalOpen} onOpenChange={setIsResultsModalOpen}>
                <DialogContent className="max-w-7xl h-auto max-h-[90vh] flex flex-col">
                     <DialogHeader>
                        <DialogTitle>Resultados da Análise DIFAL</DialogTitle>
                        <DialogDescription>
                            Os dados foram extraídos dos XMLs. Clique num valor para o copiar para a área de transferência.
                        </DialogDescription>
                    </DialogHeader>
                    
                    {totals && (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 my-4">
                             <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total de Notas</CardTitle><Hash className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{totals.count}</div></CardContent></Card>
                             <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Valor Total das Notas</CardTitle><Sigma className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{totals.totalNotesValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div></CardContent></Card>
                             <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Valor Total Guias (10%)</CardTitle><Coins className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{totals.totalGuideValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div></CardContent></Card>
                             <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Vencimento</CardTitle><ClipboardCopy className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent>
                                <div className="text-2xl font-bold flex items-center justify-between">
                                    <span>{vencimento || 'N/A'}</span>
                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => copyToClipboard(vencimento)}>
                                        <Copy className="h-4 w-4"/>
                                    </Button>
                                </div>
                             </CardContent></Card>
                        </div>
                    )}
                    
                    {processedItems.length > 0 && (
                        <Card className="flex-grow overflow-hidden">
                            <CardContent className='pt-6 h-full'>
                                <DataTable 
                                    columns={columns}
                                    data={processedItems}
                                    pageSize={1}
                                />
                            </CardContent>
                        </Card>
                    )}
                    <DialogFooter>
                         <Button onClick={handleDownloadExcel} disabled={processedItems.length === 0} variant="outline">
                            <Download className="mr-2 h-4 w-4" /> Baixar Excel
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
    
