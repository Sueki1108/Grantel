
"use client";

import { useState, useMemo, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { FileUp, Loader2, Download, Cpu, TicketPercent, Copy, AlertTriangle, FileDown, Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from './data-table';
import { getColumnsWithCustomRender } from '@/lib/columns-helper';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ProcessedData } from '@/lib/excel-processor';

// ===============================================================
// Tipos
// ===============================================================

type DifalData = {
    'Chave de Acesso': string;
    'Número da Nota': string;
    'Data de Emissão': string;
    'Valor Total da Nota': number;
    'Valor da Guia (10%)': number;
};

type IgnoredData = {
    'Chave de Acesso': string;
    'Valor da Nota': number;
    'Motivo da Rejeição': string;
};


type VerificationStatus = {
    [checkName: string]: boolean;
};

const verificationItems = [
    { id: 'date', label: 'Vencimento e "Doc. Válido" corretos' },
    { id: 'uf', label: 'UF Favorecida = MS' },
    { id: 'revenueCode', label: 'Cód. Receita = 100102' },
    { id: 'value', label: 'Valor da Guia (10%) confere' },
    { id: 'key', label: 'Chave de Acesso confere' },
    { id: 'cnpj', label: 'CNPJs (Emitente/Dest.) conferem' },
    { id: 'municipality', label: 'Município de Destino = Selvíria' },
];

// ===============================================================
// Item Component
// ===============================================================
const DifalItem = ({ item, verificationStatus, onVerificationChange }: { item: DifalData, verificationStatus: VerificationStatus, onVerificationChange: (checkId: string, isChecked: boolean) => void }) => {
    const { toast } = useToast();

    const copyToClipboard = (text: string | number, type: string) => {
        const textToCopy = typeof text === 'number' ? text.toFixed(2).replace('.',',') : String(text);
        navigator.clipboard.writeText(textToCopy).then(() => {
            toast({ title: `${type} copiad${type.endsWith('a') ? 'a' : 'o'}`, description: textToCopy });
        }).catch(() => {
            toast({ variant: 'destructive', title: `Falha ao copiar ${type}` });
        });
    };
    
    const formattedDate = useMemo(() => {
        if (!item['Data de Emissão']) return 'N/A';
        try {
            const dateStr = String(item['Data de Emissão']).substring(0, 10);
            const [year, month, day] = dateStr.split('-');
            return `${day}/${month}/${year}`;
        } catch { return 'Inválida'; }
    }, [item['Data de Emissão']]);

    const isFullyVerified = verificationItems.every(v => verificationStatus[v.id]);

    return (
         <div className={cn(
            "p-4 rounded-lg border flex flex-col gap-4 transition-colors",
            isFullyVerified ? "bg-green-100 dark:bg-green-900/30 border-green-500/50" : "bg-secondary/50"
         )}>
             <div className="font-mono text-sm break-all flex items-center gap-2">
                 <span className="text-muted-foreground">Chave:</span>
                 <span className='truncate'>{item['Chave de Acesso']}</span>
                 <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => copyToClipboard(item['Chave de Acesso'], 'Chave')}><Copy className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-sm">
                <div className="flex flex-col">
                    <span className="font-semibold">Nº da Nota</span>
                     <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">{item['Número da Nota']}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyToClipboard(item['Número da Nota'], 'Número da Nota')}><Copy className="h-3 w-3" /></Button>
                    </div>
                </div>
                <div className="flex flex-col">
                    <span className="font-semibold">Emissão</span>
                     <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">{formattedDate}</span>
                         <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyToClipboard(formattedDate, 'Data')}><Copy className="h-3 w-3" /></Button>
                    </div>
                </div>
                 <div className="flex flex-col">
                    <span className="font-semibold">Valor Total da Nota</span>
                     <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">{item['Valor Total da Nota'].toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyToClipboard(item['Valor Total da Nota'], 'Valor Total')}><Copy className="h-3 w-3" /></Button>
                    </div>
                </div>
                 <div className="flex flex-col">
                    <span className="font-semibold text-primary">Valor da Guia (10%)</span>
                     <div className="flex items-center gap-1">
                        <span className="text-muted-foreground font-bold text-base">{item['Valor da Guia (10%)'].toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyToClipboard(item['Valor da Guia (10%)'], 'Valor da Guia')}><Copy className="h-3 w-3" /></Button>
                    </div>
                </div>
            </div>
             <div className="border-t pt-4">
                <h4 className="text-sm font-semibold mb-2">Checklist de Conferência</h4>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
                    {verificationItems.map(check => (
                        <div key={check.id} className="flex items-center space-x-2">
                             <Checkbox
                                id={`${item['Chave de Acesso']}-${check.id}`}
                                checked={verificationStatus[check.id] || false}
                                onCheckedChange={(checked) => onVerificationChange(check.id, !!checked)}
                            />
                            <Label htmlFor={`${item['Chave de Acesso']}-${check.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                {check.label}
                            </Label>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};


// ===============================================================
// Main Component
// ===============================================================
interface DifalAnalysisProps {
    processedData: ProcessedData | null;
}

export function DifalAnalysis({ processedData }: DifalAnalysisProps) {
    const [pdfFiles, setPdfFiles] = useState<File[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<{ valid: DifalData[], ignored: IgnoredData[] } | null>(null);
    const [verificationStatuses, setVerificationStatuses] = useState<Record<string, VerificationStatus>>({});
    const [dueDate, setDueDate] = useState<Date | undefined>(new Date());

    const { toast } = useToast();
    
    if (!processedData) {
        return (
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                         <TicketPercent className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="font-headline text-2xl">Ferramenta de Extração e Conferência para Guia DIFAL</CardTitle>
                        </div>
                    </div>
                </CardHeader>
                 <CardContent>
                    <div className="flex flex-col items-center justify-center min-h-[300px] text-muted-foreground border-2 border-dashed rounded-lg p-8">
                        <AlertTriangle className="h-12 w-12 text-amber-500" />
                        <h3 className="mt-4 text-xl font-semibold">Aguardando Dados</h3>
                        <p className="mt-2 text-center">Execute a "Validação de Documentos" na primeira aba para carregar os dados das notas e habilitar esta ferramenta.</p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    const handleVerificationChange = (chave: string, checkId: string, isChecked: boolean) => {
        setVerificationStatuses(prev => ({
            ...prev,
            [chave]: {
                ...(prev[chave] || {}),
                [checkId]: isChecked
            }
        }));
    };

    const handlePdfFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (!selectedFiles) return;
        setPdfFiles(prev => [...prev, ...Array.from(selectedFiles)]);
        toast({ title: `${selectedFiles.length} ficheiro(s) PDF adicionados.` });
    };

    const processXmlFiles = async () => {
        if (!processedData?.sheets?.['Devoluções de Clientes']) {
             toast({ variant: "destructive", title: "Dados de base em falta", description: "A planilha 'Devoluções de Clientes' não foi encontrada nos dados processados." });
            return;
        }

        setIsLoading(true);
        setResults(null);
        
        const validData: DifalData[] = [];
        const ignoredData: IgnoredData[] = [];

        const devolucoes = processedData.sheets['Devoluções de Clientes'] || [];
        
        for (const nota of devolucoes) {
            const infCpl = nota.infCpl || ''; 
            const valorTotal = nota['Total'] || 0;
            const chaveAcesso = nota['Chave de acesso'];

            if (infCpl.toUpperCase().includes("SELVIRIA/MS")) {
                 validData.push({
                    'Chave de Acesso': chaveAcesso,
                    'Número da Nota': nota['Número'],
                    'Data de Emissão': nota['Emissão'],
                    'Valor Total da Nota': valorTotal,
                    'Valor da Guia (10%)': parseFloat((valorTotal * 0.1).toFixed(2)),
                });
            } else {
                 ignoredData.push({
                    'Chave de Acesso': chaveAcesso,
                    'Valor da Nota': valorTotal,
                    'Motivo da Rejeição': 'Local de entrega não é Selvíria/MS.',
                });
            }
        }
        
        setResults({ valid: validData, ignored: ignoredData });
        setIsLoading(false);
        toast({ title: "Processamento Concluído", description: `${validData.length} notas de devolução válidas para DIFAL e ${ignoredData.length} ignoradas.` });
    };

    const handleDownloadReport = () => {
        if (!results || results.valid.length === 0) {
            toast({ variant: 'destructive', title: 'Nenhum dado para exportar' });
            return;
        }

        const reportData = results.valid.map(item => {
            const status = verificationStatuses[item['Chave de Acesso']] || {};
            const baseData: Record<string, any> = {
                'Chave de Acesso': item['Chave de Acesso'],
                'Número da Nota': item['Número da Nota'],
                'Data de Emissão': item['Data de Emissão'],
                'Valor da Nota': item['Valor Total da Nota'],
                'Valor da Guia (10%)': item['Valor da Guia (10%)'],
            };
            verificationItems.forEach(check => {
                baseData[check.label] = status[check.id] ? 'OK' : 'Pendente';
            });
            return baseData;
        });

        const worksheet = XLSX.utils.json_to_sheet(reportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório de Conferência');
        XLSX.writeFile(workbook, `Relatorio_Conferencia_DIFAL.xlsx`);
        toast({ title: 'Relatório Gerado' });
    };
    
    const handleDownloadExcel = (data: any[], sheetName: string) => {
        if (!data || data.length === 0) {
            toast({ variant: 'destructive', title: "Nenhum dado para baixar" });
            return;
        }
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), sheetName.substring(0, 31));
        XLSX.writeFile(wb, `Analise_DIFAL_${sheetName}.xlsx`);
        toast({ title: "Download Iniciado" });
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                         <TicketPercent className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="font-headline text-2xl">Ferramenta de Extração e Conferência para Guia DIFAL</CardTitle>
                            <CardDescription>
                                Esta ferramenta analisa as 'Devoluções de Clientes' da aba de Validação para identificar as notas elegíveis para a guia DIFAL.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-8">
                    <div>
                        <h3 className="text-lg font-bold mb-2">Etapa 1: Processar Dados Base</h3>
                         <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                             <div>
                                <Label htmlFor='due-date'>Data de Vencimento da Guia</Label>
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
                            </div>
                            <Button onClick={processXmlFiles} disabled={isLoading || !processedData} className="w-full self-end">
                                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Processando...</> : <><Cpu className="mr-2 h-4 w-4" /> Analisar Devoluções para DIFAL</>}
                            </Button>
                        </div>
                    </div>

                    <div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Etapa 2</span></div></div>

                     <div>
                        <h3 className="text-lg font-bold mb-2">Etapa 2: Anexar Guias Emitidas (PDF) para Conferência</h3>
                        <p className="text-sm text-muted-foreground mb-4">Depois de emitir as guias de DIFAL, carregue os ficheiros PDF correspondentes aqui para manter um registo e facilitar a verificação na lista abaixo.</p>
                         <label htmlFor="pdf-upload-difal" className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer hover:border-primary transition-colors">
                            <FileDown className="h-10 w-10 text-muted-foreground mb-2" />
                            <span className="font-semibold">Carregar Guias (PDF)</span>
                            <span className="text-sm text-muted-foreground">Arraste ou clique para selecionar</span>
                            <input id="pdf-upload-difal" type="file" className="sr-only" onChange={handlePdfFileChange} multiple accept=".pdf" />
                        </label>
                        {pdfFiles.length > 0 && (
                            <div className="mt-4 space-y-1 text-sm">
                                <h4 className='font-medium'>Ficheiros PDF carregados:</h4>
                                <ul className="list-disc list-inside text-muted-foreground max-h-40 overflow-y-auto">
                                    {pdfFiles.map((file, i) => <li key={i}>{file.name}</li>)}
                                </ul>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {results && (
                <Card>
                    <CardHeader>
                        <div className='flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4'>
                            <div>
                                <CardTitle>Resultados e Conferência</CardTitle>
                                <CardDescription>Confira cada item da checklist e baixe o relatório final.</CardDescription>
                            </div>
                            <Button onClick={handleDownloadReport} size="sm" disabled={results.valid.length === 0}>
                                <Download className="mr-2 h-4 w-4" /> Baixar Relatório de Conferência
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Tabs defaultValue="valid">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="valid">Notas Válidas para DIFAL ({results.valid.length})</TabsTrigger>
                                <TabsTrigger value="ignored">Notas Ignoradas ({results.ignored.length})</TabsTrigger>
                            </TabsList>
                            <TabsContent value="valid" className="mt-4 space-y-2">
                                {results.valid.length > 0 ? (
                                    results.valid.map(item => 
                                        <DifalItem 
                                            key={item['Chave de Acesso']} 
                                            item={item} 
                                            verificationStatus={verificationStatuses[item['Chave de Acesso']] || {}}
                                            onVerificationChange={(checkId, isChecked) => handleVerificationChange(item['Chave de Acesso'], checkId, isChecked)}
                                        />
                                    )
                                ) : (
                                    <p className="text-center text-muted-foreground py-8">Nenhuma nota válida encontrada.</p>
                                )}
                            </TabsContent>
                            <TabsContent value="ignored" className="mt-4">
                                 <Button onClick={() => handleDownloadExcel(results.ignored, "Notas_Ignoradas_DIFAL")} size="sm" className="mb-4" disabled={results.ignored.length === 0}>
                                    <Download className="mr-2 h-4 w-4" /> Baixar Lista de Ignoradas
                                 </Button>
                                <DataTable 
                                    columns={getColumnsWithCustomRender(
                                        results.ignored, 
                                        ['Chave de Acesso', 'Valor da Nota', 'Motivo da Rejeição'],
                                        (row, id) => {
                                            const value = row.original[id as keyof typeof row.original];
                                            if (typeof value === 'number') {
                                                return <div className="text-right">{value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>;
                                            }
                                            return <div>{String(value)}</div>;
                                        }
                                    )} 
                                    data={results.ignored} 
                                />
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
