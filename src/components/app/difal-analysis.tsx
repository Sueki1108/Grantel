
"use client";

import { useState, useMemo, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/lib/columns-helper";
import { FileUp, FileDown, Loader2, Download, AlertTriangle, Cpu, TicketPercent, Copy, Check, RotateCcw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import JSZip from 'jszip';
import { cn } from '@/lib/utils';

// ===============================================================
// Types
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

const GRANTEL_CNPJ = "81732042000119";

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

const getTagValue = (element: Element | undefined, query: string): string => {
    if (!element) return '';
    const tag = element.querySelector(query);
    return tag?.textContent ?? '';
};


// ===============================================================
// Item Component
// ===============================================================
const DifalItem = ({ item, isChecked, onToggleCheck }: { item: DifalData, isChecked: boolean, onToggleCheck: () => void }) => {
    const { toast } = useToast();

    const copyToClipboard = (text: string | number, type: string) => {
        const textToCopy = String(text);
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


    return (
         <div className={cn(
            "p-4 rounded-lg border flex flex-col gap-3 transition-colors",
            isChecked ? "bg-green-100 dark:bg-green-900/30 border-green-500/50" : "bg-secondary/50"
         )}>
            <div className='flex justify-between items-start'>
                <div className="font-mono text-sm break-all flex items-center gap-2">
                     <span className="text-muted-foreground">Chave:</span>
                     <span className='truncate'>{item['Chave de Acesso']}</span>
                     <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => copyToClipboard(item['Chave de Acesso'], 'Chave')}>
                        <Copy className="h-4 w-4" />
                    </Button>
                </div>
                <Button size="sm" variant={isChecked ? "default" : "outline"} onClick={onToggleCheck} className="whitespace-nowrap">
                    {isChecked ? <RotateCcw className="mr-2 h-4 w-4" /> : <Check className="mr-2 h-4 w-4" />}
                    {isChecked ? "Desmarcar" : "Verificar"}
                </Button>
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
                    <span className="font-semibold">Valor da Guia (10%)</span>
                     <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">{item['Valor da Guia (10%)'].toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyToClipboard(item['Valor da Guia (10%)'], 'Valor da Guia')}><Copy className="h-3 w-3" /></Button>
                    </div>
                </div>
            </div>
        </div>
    );
};


// ===============================================================
// Main Component
// ===============================================================
export function DifalAnalysis() {
    const [xmlFiles, setXmlFiles] = useState<File[]>([]);
    const [pdfFiles, setPdfFiles] = useState<File[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<{ valid: DifalData[], ignored: IgnoredData[] } | null>(null);
    const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
    const { toast } = useToast();
    
    const handleToggleCheck = (chave: string) => {
        setCheckedItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(chave)) {
                newSet.delete(chave);
            } else {
                newSet.add(chave);
            }
            return newSet;
        });
    };

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

    const handlePdfFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (!selectedFiles) return;
        setPdfFiles(prev => [...prev, ...Array.from(selectedFiles)]);
        toast({ title: `${selectedFiles.length} ficheiro(s) PDF adicionados.` });
    };

    const processXmlFiles = async () => {
        if (xmlFiles.length === 0) {
            toast({ variant: "destructive", title: "Nenhum XML carregado", description: "Por favor, carregue os ficheiros XML de saída." });
            return;
        }

        setIsLoading(true);
        setResults(null);
        
        const validData: DifalData[] = [];
        const ignoredData: IgnoredData[] = [];
        const parser = new DOMParser();

        for (const file of xmlFiles) {
            try {
                const xmlText = await readFileAsText(file);
                const xmlDoc = parser.parseFromString(xmlText, "application/xml");

                const chaveAcesso = xmlDoc.querySelector('infNFe')?.getAttribute('Id')?.replace('NFe', '') || 'Chave não encontrada';
                const emitCnpj = getTagValue(xmlDoc, 'emit > CNPJ');
                const destCnpj = getTagValue(xmlDoc, 'dest > CNPJ');
                const infCpl = getTagValue(xmlDoc, 'infAdic > infCpl');
                const valorTotal = parseFloat(getTagValue(xmlDoc, 'total > ICMSTot > vNF') || '0');
                const nNF = getTagValue(xmlDoc, 'ide > nNF');
                const dhEmi = getTagValue(xmlDoc, 'ide > dhEmi');
                
                let isGrantelEmitter = emitCnpj === GRANTEL_CNPJ;
                let isGrantelDest = destCnpj === GRANTEL_CNPJ;
                let hasSelviria = infCpl.toUpperCase().includes("SELVIRIA/MS");

                if (isGrantelEmitter && isGrantelDest && hasSelviria) {
                    validData.push({
                        'Chave de Acesso': chaveAcesso,
                        'Número da Nota': nNF,
                        'Data de Emissão': dhEmi,
                        'Valor Total da Nota': valorTotal,
                        'Valor da Guia (10%)': parseFloat((valorTotal * 0.1).toFixed(2)),
                    });
                } else {
                    let reason = [];
                    if (!isGrantelEmitter) reason.push("Emitente não é a Grantel");
                    if (!isGrantelDest) reason.push("Destinatário não é a Grantel");
                    if (!hasSelviria) reason.push("Local de entrega não é Selvíria/MS");
                    ignoredData.push({
                        'Chave de Acesso': chaveAcesso,
                        'Valor da Nota': valorTotal,
                        'Motivo da Rejeição': reason.join('; '),
                    });
                }

            } catch (err) {
                console.error("Erro ao processar ficheiro", file.name, err);
                ignoredData.push({ 'Chave de Acesso': file.name, 'Valor da Nota': 0, 'Motivo da Rejeição': 'Erro de leitura do XML' });
            }
        }
        
        setResults({ valid: validData, ignored: ignoredData });
        setIsLoading(false);
        toast({ title: "Processamento Concluído", description: `${validData.length} notas válidas para DIFAL e ${ignoredData.length} notas ignoradas.` });
    };
    
    const handleDownloadExcel = (data: any[], sheetName: string) => {
        if (!data || data.length === 0) {
            toast({ variant: 'destructive', title: "Nenhum dado para baixar" });
            return;
        }
        
        const dataToExport = data.map(item => {
             if (sheetName === "Notas_Validas_DIFAL") {
                return {
                    'Chave de Acesso': item['Chave de Acesso'],
                    'Número da Nota': item['Número da Nota'],
                    'Data de Emissão': item['Data de Emissão'],
                    'Valor Total da Nota': item['Valor Total da Nota'],
                    'Valor da Guia (10%)': item['Valor da Guia (10%)'],
                };
            }
            return item;
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.substring(0, 31));
        XLSX.writeFile(workbook, `Analise_DIFAL_${sheetName}.xlsx`);
        toast({ title: "Download Iniciado" });
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                         <TicketPercent className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="font-headline text-2xl">Ferramenta de Extração para Guia DIFAL</CardTitle>
                            <CardDescription>Extraia dados de XMLs para gerar guias e, em seguida, anexe os PDFs para verificação.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div>
                        <h3 className="text-lg font-bold mb-2">Etapa 1: Processar XMLs de Saída</h3>
                        <p className="text-sm text-muted-foreground mb-4">Carregue os XMLs de saída. A ferramenta irá validar as condições e extrair os valores para a geração das guias de DIFAL.</p>
                        <label htmlFor="xml-upload-difal" className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer hover:border-primary transition-colors">
                            <FileUp className="h-10 w-10 text-muted-foreground mb-2" />
                            <span className="font-semibold">Carregar XMLs de Saída</span>
                            <span className="text-sm text-muted-foreground">Arraste ou clique para selecionar (.xml ou .zip)</span>
                            <input id="xml-upload-difal" type="file" className="sr-only" onChange={handleXmlFileChange} multiple accept=".xml,.zip" />
                        </label>
                        {xmlFiles.length > 0 && (
                            <div className="mt-2 text-sm text-muted-foreground">
                               <span className="font-bold">{xmlFiles.length}</span> ficheiro(s) XML pronto(s) para serem processados.
                            </div>
                        )}
                        <Button onClick={processXmlFiles} disabled={isLoading || xmlFiles.length === 0} className="w-full mt-4">
                            {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Processando...</> : <><Cpu className="mr-2 h-4 w-4" /> Processar XMLs</>}
                        </Button>
                    </div>

                </CardContent>
            </Card>

            {results && (
                <Card>
                    <CardHeader>
                        <CardTitle>Resultados da Análise para Guias DIFAL</CardTitle>
                        <CardDescription>Utilize os dados das "Notas Válidas" para emitir as suas guias. As "Notas Ignoradas" não cumpriram os critérios necessários.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Tabs defaultValue="valid">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="valid">Notas Válidas para DIFAL ({results.valid.length})</TabsTrigger>
                                <TabsTrigger value="ignored">Notas Ignoradas ({results.ignored.length})</TabsTrigger>
                            </TabsList>
                            <TabsContent value="valid" className="mt-4 space-y-2">
                                <Button onClick={() => handleDownloadExcel(results.valid, "Notas_Validas_DIFAL")} size="sm" className="mb-2" disabled={results.valid.length === 0}>
                                    <Download className="mr-2 h-4 w-4" /> Baixar Lista de Válidas
                                </Button>
                                {results.valid.length > 0 ? (
                                    results.valid.map(item => 
                                        <DifalItem 
                                            key={item['Chave de Acesso']} 
                                            item={item} 
                                            isChecked={checkedItems.has(item['Chave de Acesso'])}
                                            onToggleCheck={() => handleToggleCheck(item['Chave de Acesso'])}
                                        />
                                    )
                                ) : (
                                    <p className="text-center text-muted-foreground py-4">Nenhuma nota válida encontrada.</p>
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
            
            <Card>
                 <CardHeader>
                     <h3 className="text-lg font-bold">Etapa 2: Anexar Guias Emitidas (PDF) para Verificação</h3>
                     <p className="text-sm text-muted-foreground">Depois de emitir as guias de DIFAL, carregue os ficheiros PDF correspondentes aqui para manter um registo e facilitar a verificação.</p>
                </CardHeader>
                <CardContent>
                     <label htmlFor="pdf-upload-difal" className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer hover:border-primary transition-colors">
                        <FileDown className="h-10 w-10 text-muted-foreground mb-2" />
                        <span className="font-semibold">Carregar Guias (PDF)</span>
                        <span className="text-sm text-muted-foreground">Arraste ou clique para selecionar</span>
                        <input id="pdf-upload-difal" type="file" className="sr-only" onChange={handlePdfFileChange} multiple accept=".pdf" />
                    </label>
                    {pdfFiles.length > 0 && (
                        <div className="mt-4 space-y-1 text-sm">
                            <h4 className='font-medium'>Ficheiros PDF carregados:</h4>
                            <ul className="list-disc list-inside text-muted-foreground">
                                {pdfFiles.map((file, i) => <li key={i}>{file.name}</li>)}
                            </ul>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
