
"use client";

import { useState, useMemo, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { FileUp, Loader2, Download, Cpu, TicketPercent, Copy, Calendar as CalendarIcon, Hash, Sigma, Coins, ClipboardCopy } from 'lucide-react';
import JSZip from 'jszip';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DataTable } from '@/components/app/data-table';
import { getColumnsWithCustomRender } from '@/components/app/columns-helper';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { Label } from '../ui/label';

// ===============================================================
// Tipos
// ===============================================================

type DifalData = {
    'Chave de Acesso': string;
    'Número da Nota': string;
    'Data de Emissão': string;
    'Valor Total da Nota': number;
    'Valor da Guia (11%)': number;
    'Entrega': string;
};


// ===============================================================
// Helper Functions
// ===============================================================
const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target && event.target.result instanceof ArrayBuffer) {
                const buffer = event.target.result;
                try {
                    const decoder = new TextDecoder('utf-8', { fatal: true });
                    resolve(decoder.decode(buffer));
                } catch (e) {
                    const decoder = new TextDecoder('iso-8859-1');
                    resolve(decoder.decode(buffer));
                }
            } else {
                reject(new Error('Falha ao ler o ficheiro como ArrayBuffer.'));
            }
        };
        reader.onerror = () => reject(new Error(`Erro ao ler o ficheiro: ${file.name}`));
        reader.readAsArrayBuffer(file);
    });
};

const getTagValue = (element: Element | null, tagName: string): string => {
    if (!element) return '';
    const tag = element.querySelector(tagName);
    return tag?.textContent ?? '';
};


// ===============================================================
// Main Component
// ===============================================================
export function DifalAnalysis() {
    const [xmlFiles, setXmlFiles] = useState<File[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [difalData, setDifalData] = useState<DifalData[]>([]);
    const [dueDate, setDueDate] = useState<Date | undefined>(new Date());
    const { toast } = useToast();
    
    const handleXmlFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (!selectedFiles) return;
        
        let newFiles: File[] = [];
        let extractedCount = 0;

        for (const file of Array.from(selectedFiles)) {
             if (file.type === 'application/zip' || file.name.toLowerCase().endsWith('.zip')) {
                try {
                    const zip = await JSZip.loadAsync(file);
                    for (const relativePath in zip.files) {
                        const zipEntry = zip.files[relativePath];
                        if (!zipEntry?.dir && relativePath.toLowerCase().endsWith('.xml')) {
                            const content = await zipEntry.async('string');
                            newFiles.push(new File([content], zipEntry.name, { type: 'application/xml' }));
                            extractedCount++;
                        }
                    }
                } catch (error) {
                    toast({ variant: "destructive", title: `Erro ao descompactar ${file.name}` });
                }
            } else if (file.type === 'text/xml' || file.name.toLowerCase().endsWith('.xml')) {
                newFiles.push(file);
            }
        }
        
        setXmlFiles(prev => [...prev, ...newFiles]);
        toast({ title: `${newFiles.length} ficheiro(s) XML adicionados.`, description: `${extractedCount > 0 ? `(${extractedCount} de .zip)` : ''} Clique em processar para analisar.` });
    };

    const processXmls = async () => {
        if (xmlFiles.length === 0) {
            toast({ variant: "destructive", title: "Nenhum XML carregado", description: "Por favor, carregue os ficheiros XML." });
            return;
        }

        setIsLoading(true);
        setDifalData([]);
        
        const processedItems: DifalData[] = [];
        const parser = new DOMParser();

        for (const file of xmlFiles) {
            try {
                const xmlText = await readFileAsText(file);
                const xmlDoc = parser.parseFromString(xmlText, "application/xml");
                const infNFe = xmlDoc.querySelector('infNFe');
                if (!infNFe) continue;

                const chaveAcesso = infNFe.getAttribute('Id')?.replace('NFe', '') || 'N/A';
                const nNF = getTagValue(infNFe, 'ide > nNF');
                const dhEmi = getTagValue(infNFe, 'ide > dhEmi');
                const vNF = parseFloat(getTagValue(infNFe, 'total > ICMSTot > vNF') || '0');
                
                const entrega = infNFe.querySelector('entrega');
                const entregaMun = getTagValue(entrega, 'xMun');
                const entregaUf = getTagValue(entrega, 'UF');
                
                processedItems.push({
                    'Chave de Acesso': chaveAcesso,
                    'Número da Nota': nNF,
                    'Data de Emissão': dhEmi,
                    'Valor Total da Nota': vNF,
                    'Valor da Guia (11%)': parseFloat((vNF * 0.11).toFixed(2)),
                    'Entrega': entregaMun ? `${entregaMun} - ${entregaUf}` : 'N/A',
                });

            } catch (err) {
                console.error("Erro ao processar ficheiro", file.name, err);
            }
        }
        
        setDifalData(processedItems);
        setIsLoading(false);
        toast({ title: "Processamento Concluído", description: `${processedItems.length} XMLs analisados.` });
    };

    const totals = useMemo(() => {
        if (difalData.length === 0) return null;
        return {
            count: difalData.length,
            totalNotesValue: difalData.reduce((sum, item) => sum + item['Valor Total da Nota'], 0),
            totalGuideValue: difalData.reduce((sum, item) => sum + item['Valor da Guia (11%)'], 0)
        }
    }, [difalData]);
    
    const handleDownloadExcel = () => {
        if (difalData.length === 0) {
            toast({ variant: 'destructive', title: 'Nenhum dado para exportar' });
            return;
        }

        const dataToExport = difalData.map(item => ({
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

    const columns = useMemo(() => getColumnsWithCustomRender(
        difalData, 
        ['Número da Nota', 'Chave de Acesso', 'Data de Emissão', 'Valor Total da Nota', 'Valor da Guia (11%)', 'Entrega'],
        (row, id) => {
            const value = row.original[id as keyof DifalData];
            let displayValue: React.ReactNode = String(value ?? '');
            
             if (id === 'Data de Emissão' && typeof value === 'string') {
                displayValue = format(parseISO(value), 'dd/MM/yyyy');
             } else if (typeof value === 'number') {
                displayValue = value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
             }
             
             return (
                <div className="cursor-pointer hover:bg-muted p-1 rounded group flex items-center gap-1 justify-between" onClick={() => copyToClipboard(String(value))}>
                    <span>{displayValue}</span>
                    <Copy className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
             )
        }
    ), [difalData, toast]);


    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <TicketPercent className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="font-headline text-2xl">Ferramenta de Extração para Guia DIFAL</CardTitle>
                            <CardDescription>
                                Carregue os XMLs de saída, processe os dados e exporte um relatório para facilitar a criação das guias.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-8">
                    <div>
                        <h3 className="text-lg font-bold mb-4">Etapa 1: Carregar XMLs e Definir Data</h3>
                         <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                            <div className='flex flex-col gap-2'>
                                <Label>Carregar XMLs de Saída (.xml ou .zip)</Label>
                                <label htmlFor="xml-upload-difal" className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer hover:border-primary transition-colors h-full">
                                    <FileUp className="h-8 w-8 text-muted-foreground mb-1" />
                                    <span className="font-semibold text-sm">Clique ou arraste para carregar</span>
                                    <input id="xml-upload-difal" type="file" className="sr-only" onChange={handleXmlFileChange} multiple accept=".xml,.zip" />
                                </label>
                                {xmlFiles.length > 0 && <div className="text-sm text-muted-foreground"><span className="font-bold">{xmlFiles.length}</span> ficheiro(s) carregados.</div>}
                            </div>
                            <div>
                                <Label htmlFor='due-date'>Data de Pagamento da Guia</Label>
                                <div className="flex items-center gap-2">
                                     <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                id="due-date"
                                                variant={"outline"}
                                                className={cn(
                                                    "w-full justify-start text-left font-normal",
                                                    !dueDate && "text-muted-foreground"
                                                )}
                                            >
                                                <CalendarIcon className="mr-2 h-4 w-4" />
                                                {dueDate ? format(dueDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : <span>Selecione uma data</span>}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0">
                                            <Calendar
                                                mode="single"
                                                selected={dueDate}
                                                onSelect={setDueDate}
                                                initialFocus
                                            />
                                        </PopoverContent>
                                    </Popover>
                                     <Button size="icon" variant="ghost" onClick={() => copyToClipboard(dueDate ? format(dueDate, 'dd/MM/yyyy') : '')} disabled={!dueDate}>
                                        <ClipboardCopy className="h-6 w-6" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                     <div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Etapa 2</span></div></div>
                     <div>
                        <h3 className="text-lg font-bold mb-2">Etapa 2: Processar e Exportar</h3>
                         <p className='text-sm text-muted-foreground mb-4'>Clique para extrair os dados dos XMLs. Depois, poderá baixar a planilha com os resultados.</p>
                        <div className='flex flex-col sm:flex-row gap-4'>
                            <Button onClick={processXmls} disabled={isLoading || xmlFiles.length === 0} className="w-full">
                                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Processando...</> : <><Cpu className="mr-2 h-4 w-4" /> Processar XMLs</>}
                            </Button>
                             <Button onClick={handleDownloadExcel} disabled={difalData.length === 0} className="w-full">
                                <Download className="mr-2 h-4 w-4" /> Baixar Excel
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {totals && (
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
            )}

            {difalData.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Dados Extraídos para DIFAL</CardTitle>
                        <CardDescription>
                            Os seguintes dados foram extraídos dos XMLs carregados. Clique sobre qualquer informação para a copiar.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                       <DataTable 
                            columns={columns}
                            data={difalData}
                       />
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
