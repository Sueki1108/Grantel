"use client";

import { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/app/data-table";
import { getColumns } from "@/lib/columns-helper";
import { FileSearch, Loader2, Download, FilePieChart, AlertTriangle, FilterX, X, RotateCcw, ListFilter } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

// ===============================================================
// Types
// ===============================================================

type NfseData = {
    fileName: string;
    numero_nfse: string;
    data_nfse: string;
    valor_total: number;
    valor_ir: number;
    valor_inss: number;
    valor_contribuicao_social: number;
    valor_pis: number;
    valor_cofins: number;
    tomador_razao_social: string;
    codigo_item_lista_servico: string;
    descritivo: string;
    valor_issrf: number;
};

type FinancialSummary = {
    'Soma Total das Notas': number;
    'Total de Notas (únicas)': number;
    'Soma Líquida Item 702': number;
    'Soma Líquida Item 703': number;
    'Total Suspenso (Item 702)': number;
    'Total Suspenso (Item 703)': number;
};

type RetentionSummary = {
    'Retenção ISS': number;
    'Retenção IR': number;
    'Retenção INSS': number;
    'Retenção CSLL': number;
    'Retenção PIS': number;
    'Retenção COFINS': number;
};

type DetailedData = {
    all: NfseData[];
    service702: NfseData[];
    service703: NfseData[];
    susp702: NfseData[];
    susp703: NfseData[];
    pending: NfseData[];
    retention: {
        iss: NfseData[];
        ir: NfseData[];
        inss: NfseData[];
        csll: NfseData[];
        pis: NfseData[];
        cofins: NfseData[];
    }
};

type AnalysisResults = {
    financialSummary: FinancialSummary | null;
    retentionSummary: RetentionSummary | null;
    pendingNotes: NfseData[];
    detailedData: DetailedData;
};

interface NfseAnalysisProps {
    nfseFiles: File[];
    disregardedNotes: Set<string>;
    onDisregardedNotesChange: (notes: Set<string>) => void;
}


// ===============================================================
// Helper Functions & Constants
// ===============================================================
const parseCurrency = (value: string | null | undefined): number => {
    if (!value) return 0;
    return parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0;
};

const SUSPENSION_PHRASES = [
    "suspensao da exigibilidade", 
    "suspensao da exigencia", 
    "suspensao da contribuicao",
    "suspensao por decisao judicial" // Adicionada uma quarta frase comum.
];


const normalizeText = (text: string | null | undefined): string => {
    if (!text) return "";
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, " ")
        .trim();
};

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
                    try {
                        const decoder = new TextDecoder('iso-8859-1');
                        resolve(decoder.decode(buffer));
                    } catch (e2) {
                        reject(new Error(`Falha ao descodificar o ficheiro ${file.name} com UTF-8 e ISO-8859-1.`));
                    }
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
// Main Component
// ===============================================================
export function NfseAnalysis({ nfseFiles, disregardedNotes, onDisregardedNotesChange }: NfseAnalysisProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [allExtractedData, setAllExtractedData] = useState<NfseData[]>([]);
    const [noteInput, setNoteInput] = useState('');
    const [selectedSuspensionPhrases, setSelectedSuspensionPhrases] = useState<Set<string>>(new Set(SUSPENSION_PHRASES));
    
    const { toast } = useToast();

    // STEP 1: Extract raw data from XMLs whenever files change
    useEffect(() => {
        const extractData = async () => {
            if (nfseFiles.length === 0) {
                setAllExtractedData([]);
                return;
            }
            setIsLoading(true);
            const extractedData: NfseData[] = [];
            const parser = new DOMParser();

            for (const file of nfseFiles) {
                try {
                    const xmlText = await readFileAsText(file);
                    const xmlDoc = parser.parseFromString(xmlText, "application/xml");
                    
                    const errorNode = xmlDoc.querySelector("parsererror");
                    if (errorNode) {
                        console.error("Erro de Análise de XML em", file.name, errorNode.textContent);
                        continue;
                    }
                    
                    const nfNode = xmlDoc.querySelector('nf');
                    const listaNode = xmlDoc.querySelector('itens > lista');
                    if (!nfNode || !listaNode) continue;
                    
                    const data: NfseData = {
                        fileName: file.name,
                        numero_nfse: getTagValue(nfNode, 'numero_nfse'),
                        data_nfse: getTagValue(nfNode, 'data_nfse'),
                        valor_total: parseCurrency(getTagValue(nfNode, 'valor_total')),
                        valor_ir: parseCurrency(getTagValue(nfNode, 'valor_ir')),
                        valor_inss: parseCurrency(getTagValue(nfNode, 'valor_inss')),
                        valor_contribuicao_social: parseCurrency(getTagValue(nfNode, 'valor_contribuicao_social')),
                        valor_pis: parseCurrency(getTagValue(nfNode, 'valor_pis')),
                        valor_cofins: parseCurrency(getTagValue(nfNode, 'valor_cofins')),
                        tomador_razao_social: xmlDoc.querySelector('tomador > nome_razao_social')?.textContent ?? '',
                        codigo_item_lista_servico: getTagValue(listaNode, 'codigo_item_lista_servico'),
                        descritivo: getTagValue(listaNode, 'descritivo'),
                        valor_issrf: parseCurrency(getTagValue(listaNode, 'valor_issrf')),
                    };
                    extractedData.push(data);
                } catch (e: any) {
                     console.error(`Error processing file ${file.name}:`, e);
                }
            }
            setAllExtractedData(extractedData);
            setIsLoading(false);
        };
        extractData();
    }, [nfseFiles]);
    
    // Perform analysis based on selected phrases
    const analysisResults = useMemo((): AnalysisResults | null => {
        if (allExtractedData.length === 0) return null;

        const filteredData = allExtractedData.filter(d => !disregardedNotes.has(d.numero_nfse));

        const detailedData: DetailedData = {
            all: filteredData, service702: [], service703: [],
            susp702: [], susp703: [], pending: [],
            retention: { iss: [], ir: [], inss: [], csll: [], pis: [], cofins: [] }
        };

        let total702 = 0;
        let total703 = 0;
        let suspended702 = 0;
        let suspended703 = 0;

        const retentionSummary: RetentionSummary = {
            'Retenção ISS': 0, 'Retenção IR': 0, 'Retenção INSS': 0,
            'Retenção CSLL': 0, 'Retenção PIS': 0, 'Retenção COFINS': 0
        };
        const pendingNotes: NfseData[] = [];

        for (const nf of filteredData) {
            retentionSummary['Retenção ISS'] += nf.valor_issrf;
            retentionSummary['Retenção IR'] += nf.valor_ir;
            retentionSummary['Retenção INSS'] += nf.valor_inss;
            retentionSummary['Retenção CSLL'] += nf.valor_contribuicao_social;
            retentionSummary['Retenção PIS'] += nf.valor_pis;
            retentionSummary['Retenção COFINS'] += nf.valor_cofins;

            if (nf.valor_issrf > 0) detailedData.retention.iss.push(nf);
            if (nf.valor_ir > 0) detailedData.retention.ir.push(nf);
            if (nf.valor_inss > 0) detailedData.retention.inss.push(nf);
            if (nf.valor_contribuicao_social > 0) detailedData.retention.csll.push(nf);
            if (nf.valor_pis > 0) detailedData.retention.pis.push(nf);
            if (nf.valor_cofins > 0) detailedData.retention.cofins.push(nf);

            const serviceCode = nf.codigo_item_lista_servico;
            if (serviceCode === '702') {
                total702 += nf.valor_total;
                detailedData.service702.push(nf);
            } else if (serviceCode === '703') {
                total703 += nf.valor_total;
                detailedData.service703.push(nf);
            }

            const normalizedDescritivo = normalizeText(nf.descritivo);
            const isSuspended = Array.from(selectedSuspensionPhrases).some(phrase => normalizedDescritivo.includes(phrase));
            
            if (isSuspended) {
                 if (serviceCode === '702') {
                    suspended702 += nf.valor_total;
                    detailedData.susp702.push(nf);
                } else if (serviceCode === '703') {
                    suspended703 += nf.valor_total;
                    detailedData.susp703.push(nf);
                }
            } else if (normalizedDescritivo.includes('suspensao')) {
                 pendingNotes.push(nf);
                 detailedData.pending.push(nf);
            }
        }
        
        const financialSummary: FinancialSummary = {
            'Soma Total das Notas': total702 + total703,
            'Total de Notas (únicas)': new Set(filteredData.map(d => d.numero_nfse)).size,
            'Soma Líquida Item 702': total702 - suspended702,
            'Soma Líquida Item 703': total703 - suspended703,
            'Total Suspenso (Item 702)': suspended702,
            'Total Suspenso (Item 703)': suspended703,
        };

        return { financialSummary, retentionSummary, pendingNotes, detailedData };
    }, [allExtractedData, disregardedNotes, selectedSuspensionPhrases]);

    const handleDisregardNote = () => {
        if (!noteInput.trim()) return;
        const newNotes = new Set(disregardedNotes);
        noteInput.split(',').forEach(n => {
            const trimmed = n.trim();
            if (trimmed) newNotes.add(trimmed);
        });
        onDisregardedNotesChange(newNotes);
        setNoteInput('');
        toast({ title: 'Notas desconsideradas', description: 'A análise foi atualizada.' });
    };

    const handleRevertNote = (noteNumber: string) => {
        const newNotes = new Set(disregardedNotes);
        newNotes.delete(noteNumber);
        onDisregardedNotesChange(newNotes);
        toast({ title: 'Nota revertida', description: `A nota ${noteNumber} foi incluída novamente na análise.` });
    };
    
    const handleSuspensionPhraseToggle = (phrase: string, checked: boolean) => {
        const newSet = new Set(selectedSuspensionPhrases);
        if (checked) {
            newSet.add(phrase);
        } else {
            newSet.delete(phrase);
        }
        setSelectedSuspensionPhrases(newSet);
    };

    const handleDownloadExcel = (data: any[] | null, sheetName: string) => {
        if (!data || data.length === 0) {
            toast({ variant: 'destructive', title: "Nenhum dado para baixar" });
            return;
        }
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), sheetName.substring(0, 31));
        XLSX.writeFile(wb, `Analise_NFS-e_${sheetName}.xlsx`);
        toast({ title: "Download Iniciado" });
    };
    
    const handleDownloadFullExcel = () => {
        if (!analysisResults) return;
        const wb = XLSX.utils.book_new();
        const addSheet = (data: any[], name: string) => {
            if (data.length > 0) {
                 XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), name.substring(0, 31));
            }
        }
    
        if (analysisResults.financialSummary) addSheet(Object.entries(analysisResults.financialSummary).map(([k, v]) => ({ Descrição: k, Valor: v })), "Resumo Financeiro");
        if (analysisResults.retentionSummary) addSheet(Object.entries(analysisResults.retentionSummary).map(([k, v]) => ({ Descrição: k, Valor: v })), "Resumo Retenções");
        
        addSheet(analysisResults.detailedData.all, "Dados Completos");
        addSheet(analysisResults.detailedData.service702, "Itens 702");
        addSheet(analysisResults.detailedData.susp702, "Suspensão 702");
        addSheet(analysisResults.detailedData.service703, "Itens 703");
        addSheet(analysisResults.detailedData.susp703, "Suspensão 703");
        addSheet(analysisResults.detailedData.retention.iss, "Retenção ISS");
        addSheet(analysisResults.detailedData.retention.ir, "Retenção IR");
        addSheet(analysisResults.detailedData.retention.inss, "Retenção INSS");
        addSheet(analysisResults.detailedData.retention.csll, "Retenção CSLL");
        addSheet(analysisResults.detailedData.retention.pis, "Retenção PIS");
        addSheet(analysisResults.detailedData.retention.cofins, "Retenção COFINS");
        addSheet(analysisResults.detailedData.pending, "Pendentes (Suspensão Genérica)");
    
        XLSX.writeFile(wb, "Analise_Completa_NFS-e.xlsx");
        toast({ title: "Download Iniciado", description: "A planilha completa está a ser descarregada." });
    };

    const SummaryCard = ({ title, data }: { title: string, data: Record<string, string | number> | null }) => (
        <Card>
            <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
            <CardContent>
                {data ? (
                    <div className="space-y-2">
                        {Object.entries(data).map(([key, value]) => (
                            <div key={key} className="flex justify-between items-center text-sm border-b pb-1">
                                <span className="text-muted-foreground">{key}</span>
                                <span className="font-medium">
                                    {typeof value === 'number' ? value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : ( <div className="text-center text-muted-foreground py-8">Aguardando dados...</div> )}
            </CardContent>
        </Card>
    );

    const renderContent = () => {
        if (nfseFiles.length === 0) {
            return (
                 <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
                    <FileSearch className="h-16 w-16 mb-4" />
                    <h3 className="text-xl font-semibold">Nenhum ficheiro NFS-e encontrado</h3>
                    <p>Carregue os ficheiros XML na primeira aba para iniciar a análise.</p>
                </div>
            );
        }
        if (isLoading) {
            return (
                <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
                    <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
                    <h3 className="text-xl font-semibold">A extrair dados de {nfseFiles.length} ficheiros...</h3>
                </div>
            );
        }
        if (!analysisResults) {
             return (
                 <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
                    <FileSearch className="h-16 w-16 mb-4" />
                    <h3 className="text-xl font-semibold">Nenhum resultado</h3>
                    <p>Não foi possível extrair dados dos ficheiros NFS-e. Verifique se são válidos.</p>
                </div>
            );
        }

        const dataTabs = [
            { label: `Soma Total (${analysisResults.detailedData.all.length})`, data: analysisResults.detailedData.all, sheetName: "Dados_Completos" },
            { label: `Soma 702 (${analysisResults.detailedData.service702.length})`, data: analysisResults.detailedData.service702, sheetName: "Itens_702" },
            { label: `Susp. 702 (${analysisResults.detailedData.susp702.length})`, data: analysisResults.detailedData.susp702, sheetName: "Suspensao_702" },
            { label: `Soma 703 (${analysisResults.detailedData.service703.length})`, data: analysisResults.detailedData.service703, sheetName: "Itens_703" },
            { label: `Susp. 703 (${analysisResults.detailedData.susp703.length})`, data: analysisResults.detailedData.susp703, sheetName: "Suspensao_703" },
            { label: `Ret. ISS (${analysisResults.detailedData.retention.iss.length})`, data: analysisResults.detailedData.retention.iss, sheetName: "Retencao_ISS" },
            { label: `Ret. IR (${analysisResults.detailedData.retention.ir.length})`, data: analysisResults.detailedData.retention.ir, sheetName: "Retencao_IR" },
            { label: `Ret. INSS (${analysisResults.detailedData.retention.inss.length})`, data: analysisResults.detailedData.retention.inss, sheetName: "Retencao_INSS" },
            { label: `Ret. CSLL (${analysisResults.detailedData.retention.csll.length})`, data: analysisResults.detailedData.retention.csll, sheetName: "Retencao_CSLL" },
            { label: `Ret. PIS (${analysisResults.detailedData.retention.pis.length})`, data: analysisResults.detailedData.retention.pis, sheetName: "Retencao_PIS" },
            { label: `Ret. COFINS (${analysisResults.detailedData.retention.cofins.length})`, data: analysisResults.detailedData.retention.cofins, sheetName: "Retencao_COFINS" },
            { label: `Pendentes (${analysisResults.detailedData.pending.length})`, data: analysisResults.detailedData.pending, sheetName: "Pendentes_Suspensao_Generica" }
        ].filter(tab => tab.data.length > 0);


        return (
             <Tabs defaultValue="summary" className="w-full">
                <TabsList className="grid w-full grid-cols-1 md:grid-cols-2">
                    <TabsTrigger value="summary">Resumo da Análise</TabsTrigger>
                    <TabsTrigger value="data-details">Dados Detalhados</TabsTrigger>
                </TabsList>

                <TabsContent value="summary" className="mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <SummaryCard title="Resultados Financeiros" data={analysisResults.financialSummary} />
                        <SummaryCard title="Totais de Retenção" data={analysisResults.retentionSummary} />
                    </div>
                     {analysisResults.pendingNotes.length > 0 && (
                        <Card className="mt-6">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                                    Pendentes de Verificação (Suspensão Genérica)
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground mb-2">
                                    As seguintes notas contêm a palavra "suspensão", mas não uma das frases específicas selecionadas no filtro, e requerem verificação manual:
                                </p>
                                <p className="text-sm font-medium break-words">{analysisResults.pendingNotes.map(n => n.numero_nfse).join(', ')}</p>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>
                
                <TabsContent value="data-details" className="mt-6">
                     <Tabs defaultValue={dataTabs[0]?.label} className="w-full">
                        <TabsList className="h-auto flex-wrap justify-start">
                            {dataTabs.map(tab => <TabsTrigger key={tab.label} value={tab.label}>{tab.label}</TabsTrigger>)}
                        </TabsList>
                        {dataTabs.map(tab => (
                            <TabsContent key={tab.label} value={tab.label} className="mt-4">
                                 <Button 
                                    onClick={() => handleDownloadExcel(tab.data, tab.sheetName)}
                                    variant="outline" size="sm" 
                                    className="mb-4"
                                    disabled={tab.data.length === 0}
                                >
                                    <Download className="mr-2 h-4 w-4" /> Baixar esta Aba
                                </Button>
                                <DataTable columns={getColumns(tab.data)} data={tab.data} />
                            </TabsContent>
                        ))}
                    </Tabs>
                </TabsContent>
            </Tabs>
        );
    }

    return (
        <Card className="shadow-lg">
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className='flex items-center gap-3'>
                        <FilePieChart className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="font-headline text-2xl">Análise de NFS-e</CardTitle>
                            <CardDescription>Resumo e detalhe das notas fiscais de serviço carregadas.</CardDescription>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        <Button onClick={handleDownloadFullExcel} variant="outline" size="sm" disabled={!analysisResults}><Download className="mr-2 h-4 w-4" />Planilha Completa</Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                 <Accordion type="single" collapsible className="w-full mb-6">
                    <AccordionItem value="filters">
                        <AccordionTrigger>
                            <div className='flex items-center gap-2 text-base'>
                                <ListFilter className="h-5 w-5" /> Filtros e Opções de Análise
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className='pt-4'>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <Card className="bg-muted/50">
                                    <CardHeader className='pb-2'><CardTitle className="text-lg">Desconsiderar Notas</CardTitle></CardHeader>
                                    <CardContent>
                                        <div className="flex gap-4 items-end">
                                            <div className="flex-grow">
                                                <Label htmlFor="disregarded-notes-input">Número(s) da NFS-e</Label>
                                                <Input id="disregarded-notes-input" placeholder="Ex: 3673, 3674" value={noteInput} onChange={(e) => setNoteInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleDisregardNote()} />
                                            </div>
                                            <Button onClick={handleDisregardNote}><FilterX className='h-4 w-4 mr-2'/>Desconsiderar</Button>
                                        </div>
                                        {disregardedNotes.size > 0 && (
                                            <div className="mt-4">
                                                <h4 className="text-sm font-medium mb-2">Notas desconsideradas:</h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {Array.from(disregardedNotes).map(note => (
                                                        <div key={note} className="flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-sm">
                                                            <span>{note}</span>
                                                            <Button variant="ghost" size="icon" className="h-5 w-5 rounded-full" onClick={() => handleRevertNote(note)} title="Reverter">
                                                                <RotateCcw className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                                 <Card className="bg-muted/50">
                                    <CardHeader className='pb-2'><CardTitle className="text-lg">Frases de Suspensão Ativas</CardTitle></CardHeader>
                                    <CardContent>
                                        <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                                            {SUSPENSION_PHRASES.map(phrase => (
                                                <div key={phrase} className="flex items-center space-x-2">
                                                    <Checkbox id={`phrase-${phrase}`} checked={selectedSuspensionPhrases.has(phrase)} onCheckedChange={(checked) => handleSuspensionPhraseToggle(phrase, !!checked)} />
                                                    <Label htmlFor={`phrase-${phrase}`} className="text-sm font-light leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{phrase}</Label>
                                                </div>
                                            ))}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
                {renderContent()}
            </CardContent>
        </Card>
    );
}
