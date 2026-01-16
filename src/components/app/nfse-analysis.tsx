"use client";

import { useState, useMemo, useEffect, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/app/data-table";
import { getColumns } from "@/components/app/columns-helper";
import { FileSearch, Loader2, Download, FilePieChart, AlertTriangle, FilterX, X, RotateCcw, ListFilter, Eye } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

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
};

type RetentionSummary = {
    'Retenção ISS': number;
    'Retenção IR': number;
    'Retenção INSS': number;
    'Retenção CSLL': number;
    'Retenção PIS': number;
    'Retenção COFINS': number;
};

type ServiceItemSummary = {
    'Soma Total Item': number;
    'Total Suspensão': number;
    'Soma Líquida Item': number;
    'Retenções': RetentionSummary;
};

type DetailedData = {
    all: NfseData[];
    service702: NfseData[];
    service703: NfseData[];
    susp702: NfseData[];
    susp703: NfseData[];
    liquid702: NfseData[];
    liquid703: NfseData[];
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
    financialSummary: FinancialSummary;
    summary702: ServiceItemSummary;
    summary703: ServiceItemSummary;
    totalRetentionSummary: RetentionSummary;
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
    "suspensao por decisao judicial"
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
                    // Try UTF-8 first.
                    const decoder = new TextDecoder('utf-8', { fatal: true });
                    const text = decoder.decode(buffer);
                    if (text.includes('\uFFFD')) { // Check for the Unicode Replacement Character
                        throw new Error("UTF-8 decoding resulted in replacement characters.");
                    }
                    resolve(text);
                } catch (e) {
                    try {
                        // Fallback to ISO-8859-1 if UTF-8 fails
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

const highlightText = (text: string, phrase: string) => {
  if (!phrase || !text) {
    return text;
  }
  const regex = new RegExp(`(${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  
  return (
    <>
      {parts.map((part, index) =>
        regex.test(part) ? (
          <span key={index} className="font-bold text-red-600 dark:text-red-400">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
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
                        toast({
                            variant: "destructive",
                            title: `Erro ao analisar ${file.name}`,
                            description: "O ficheiro XML parece estar malformado ou não é um XML.",
                        });
                        continue;
                    }
                    
                    const nfNode = xmlDoc.querySelector('nf');
                    const listaNode = xmlDoc.querySelector('itens > lista');
                    if (!nfNode || !listaNode) {
                        toast({
                            variant: "destructive",
                            title: `Estrutura Incompatível: ${file.name}`,
                            description: "O XML não contém as tags <nf> ou <itens> necessárias. O ficheiro será ignorado.",
                        });
                        continue;
                    }
                    
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
                     toast({
                        variant: "destructive",
                        title: `Erro ao processar ${file.name}`,
                        description: e.message || "Ocorreu um erro desconhecido.",
                    });
                }
            }
            setAllExtractedData(extractedData);
            setIsLoading(false);
        };
        extractData();
    }, [nfseFiles, toast]);
    
    // Perform analysis based on selected phrases
    const analysisResults = useMemo((): AnalysisResults | null => {
        if (allExtractedData.length === 0) return null;

        const filteredData = allExtractedData.filter(d => !disregardedNotes.has(d.numero_nfse));

        const detailedData: DetailedData = {
            all: filteredData, service702: [], service703: [],
            susp702: [], susp703: [], liquid702: [], liquid703: [], pending: [],
            retention: { iss: [], ir: [], inss: [], csll: [], pis: [], cofins: [] }
        };

        let summary702: ServiceItemSummary = { 'Soma Total Item': 0, 'Total Suspensão': 0, 'Soma Líquida Item': 0, 'Retenções': { 'Retenção ISS': 0, 'Retenção IR': 0, 'Retenção INSS': 0, 'Retenção CSLL': 0, 'Retenção PIS': 0, 'Retenção COFINS': 0 } };
        let summary703: ServiceItemSummary = { 'Soma Total Item': 0, 'Total Suspensão': 0, 'Soma Líquida Item': 0, 'Retenções': { 'Retenção ISS': 0, 'Retenção IR': 0, 'Retenção INSS': 0, 'Retenção CSLL': 0, 'Retenção PIS': 0, 'Retenção COFINS': 0 } };
        
        const pendingNotes: NfseData[] = [];
        let totalNotasGeral = 0;


        for (const nf of filteredData) {
            totalNotasGeral += nf.valor_total;
            
            // Populate detailed retention arrays
            if (nf.valor_issrf > 0) detailedData.retention.iss.push(nf);
            if (nf.valor_ir > 0) detailedData.retention.ir.push(nf);
            if (nf.valor_inss > 0) detailedData.retention.inss.push(nf);
            if (nf.valor_contribuicao_social > 0) detailedData.retention.csll.push(nf);
            if (nf.valor_pis > 0) detailedData.retention.pis.push(nf);
            if (nf.valor_cofins > 0) detailedData.retention.cofins.push(nf);
            
            const normalizedDescritivo = normalizeText(nf.descritivo);
            const isSuspended = Array.from(selectedSuspensionPhrases).some(phrase => normalizedDescritivo.includes(phrase));

            const processRetentions = (summary: ServiceItemSummary) => {
                summary['Retenções']['Retenção ISS'] += nf.valor_issrf;
                summary['Retenções']['Retenção IR'] += nf.valor_ir;
                summary['Retenções']['Retenção INSS'] += nf.valor_inss;
                summary['Retenções']['Retenção CSLL'] += nf.valor_contribuicao_social;
                summary['Retenções']['Retenção PIS'] += nf.valor_pis;
                summary['Retenções']['Retenção COFINS'] += nf.valor_cofins;
            };

            if (nf.codigo_item_lista_servico === '702') {
                summary702['Soma Total Item'] += nf.valor_total;
                detailedData.service702.push(nf);
                processRetentions(summary702);
                if (isSuspended) {
                    summary702['Total Suspensão'] += nf.valor_total;
                    detailedData.susp702.push(nf);
                } else {
                    detailedData.liquid702.push(nf);
                }
            } else if (nf.codigo_item_lista_servico === '703') {
                summary703['Soma Total Item'] += nf.valor_total;
                detailedData.service703.push(nf);
                processRetentions(summary703);
                 if (isSuspended) {
                    summary703['Total Suspensão'] += nf.valor_total;
                    detailedData.susp703.push(nf);
                } else {
                    detailedData.liquid703.push(nf);
                }
            }
            
            if (!isSuspended && normalizedDescritivo.includes('suspensao')) {
                 pendingNotes.push(nf);
                 detailedData.pending.push(nf);
            }
        }
        
        summary702['Soma Líquida Item'] = summary702['Soma Total Item'] - summary702['Total Suspensão'];
        summary703['Soma Líquida Item'] = summary703['Soma Total Item'] - summary703['Total Suspensão'];

        const financialSummary: FinancialSummary = {
            'Soma Total das Notas': totalNotasGeral,
            'Total de Notas (únicas)': new Set(filteredData.map(d => d.numero_nfse)).size,
        };
        
        const totalRetentionSummary: RetentionSummary = {
            'Retenção ISS': summary702.Retenções['Retenção ISS'] + summary703.Retenções['Retenção ISS'],
            'Retenção IR': summary702.Retenções['Retenção IR'] + summary703.Retenções['Retenção IR'],
            'Retenção INSS': summary702.Retenções['Retenção INSS'] + summary703.Retenções['Retenção INSS'],
            'Retenção CSLL': summary702.Retenções['Retenção CSLL'] + summary703.Retenções['Retenção CSLL'],
            'Retenção PIS': summary702.Retenções['Retenção PIS'] + summary703.Retenções['Retenção PIS'],
            'Retenção COFINS': summary702.Retenções['Retenção COFINS'] + summary703.Retenções['Retenção COFINS'],
        };

        return { financialSummary, summary702, summary703, totalRetentionSummary, pendingNotes, detailedData };
    }, [allExtractedData, disregardedNotes, selectedSuspensionPhrases]);

    const handleDisregardNote = () => {
        if (!noteInput.trim()) return;
        const newNotes = new Set(disregardedNotes);
        
        // Split by space, comma, or any whitespace and filter out empty strings
        noteInput.split(/[\s,]+/).forEach(n => {
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

    const handleClearAllDisregarded = () => {
        onDisregardedNotesChange(new Set());
        toast({ title: 'Todas as notas revertidas', description: 'Todas as notas desconsideradas foram incluídas novamente na análise.' });
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
    
        if (analysisResults.financialSummary) addSheet([analysisResults.financialSummary], "Resumo Financeiro");
        if (analysisResults.summary702) addSheet([analysisResults.summary702], "Resumo Item 702");
        if (analysisResults.summary703) addSheet([analysisResults.summary703], "Resumo Item 703");
        
        addSheet(analysisResults.detailedData.all, "Dados Completos");
        addSheet(analysisResults.detailedData.service702, "Itens 702");
        addSheet(analysisResults.detailedData.susp702, "Suspensão 702");
        addSheet(analysisResults.detailedData.liquid702, "Líquido 702");
        addSheet(analysisResults.detailedData.service703, "Itens 703");
        addSheet(analysisResults.detailedData.susp703, "Suspensão 703");
        addSheet(analysisResults.detailedData.liquid703, "Líquido 703");
        addSheet(analysisResults.detailedData.pending, "Pendentes (Suspensão Genérica)");
        addSheet(analysisResults.detailedData.retention.iss, "Retenção ISS");
        addSheet(analysisResults.detailedData.retention.ir, "Retenção IR");
        addSheet(analysisResults.detailedData.retention.inss, "Retenção INSS");
        addSheet(analysisResults.detailedData.retention.csll, "Retenção CSLL");
        addSheet(analysisResults.detailedData.retention.pis, "Retenção PIS");
        addSheet(analysisResults.detailedData.retention.cofins, "Retenção COFINS");
    
        XLSX.writeFile(wb, "Analise_Completa_NFS-e.xlsx");
        toast({ title: "Download Iniciado", description: "A planilha completa está a ser descarregada." });
    };

    const SummaryLine = ({ label, value }: { label: string, value: number | string }) => (
         <div className="flex justify-between items-center text-sm border-b pb-1">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium">
                {typeof value === 'number' ? (
                    label.includes("Total de Notas") 
                        ? value.toLocaleString('pt-BR') 
                        : value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                ) : value}
            </span>
        </div>
    );
    

    const getNotesForPhrase = (phrase: string): NfseData[] => {
        if (!analysisResults) return [];
        return analysisResults.detailedData.all.filter(nf => normalizeText(nf.descritivo).includes(phrase));
    };


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
        if (!analysisResults || !analysisResults.financialSummary) {
             return (
                 <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
                    <FileSearch className="h-16 w-16 mb-4" />
                    <h3 className="text-xl font-semibold">Nenhum resultado</h3>
                    <p>Não foi possível extrair dados dos ficheiros NFS-e. Verifique se são válidos.</p>
                </div>
            );
        }

        const dataTabs = [
            { label: `Todas (${analysisResults.detailedData.all.length})`, data: analysisResults.detailedData.all, sheetName: "Dados_Completos" },
            { label: `Itens 702 (${analysisResults.detailedData.service702.length})`, data: analysisResults.detailedData.service702, sheetName: "Itens_702" },
            { label: `Suspensão 702 (${analysisResults.detailedData.susp702.length})`, data: analysisResults.detailedData.susp702, sheetName: "Suspensao_702" },
            { label: `Líquido 702 (${analysisResults.detailedData.liquid702.length})`, data: analysisResults.detailedData.liquid702, sheetName: "Liquido_702" },
            { label: `Itens 703 (${analysisResults.detailedData.service703.length})`, data: analysisResults.detailedData.service703, sheetName: "Itens_703" },
            { label: `Suspensão 703 (${analysisResults.detailedData.susp703.length})`, data: analysisResults.detailedData.susp703, sheetName: "Suspensao_703" },
            { label: `Líquido 703 (${analysisResults.detailedData.liquid703.length})`, data: analysisResults.detailedData.liquid703, sheetName: "Liquido_703" },
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <Card className="lg:col-span-1">
                             <CardHeader><CardTitle>Resultados Gerais</CardTitle></CardHeader>
                             <CardContent className="space-y-2">
                                <SummaryLine label="Soma Total das Notas" value={analysisResults.financialSummary['Soma Total das Notas']} />
                                <SummaryLine label="Total de Notas (únicas)" value={analysisResults.financialSummary['Total de Notas (únicas)']} />
                                <div className="pt-2 mt-2 border-t" />
                                {Object.entries(analysisResults.totalRetentionSummary).map(([key, value]) => (
                                    <SummaryLine key={key} label={key} value={value} />
                                ))}
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle>Análise Item 702</CardTitle></CardHeader>
                            <CardContent className="space-y-2">
                                 <SummaryLine label="Soma Total Item" value={analysisResults.summary702['Soma Total Item']} />
                                 <SummaryLine label="Total Suspensão" value={analysisResults.summary702['Total Suspensão']} />
                                 <SummaryLine label="Soma Líquida Item" value={analysisResults.summary702['Soma Líquida Item']} />
                                 <div className="pt-2 mt-2 border-t">
                                     <h4 className='font-medium text-sm mb-1'>Retenções (Item 702)</h4>
                                      {Object.entries(analysisResults.summary702.Retenções).map(([key, value]) => (
                                         <SummaryLine key={key} label={key} value={value} />
                                     ))}
                                 </div>
                            </CardContent>
                        </Card>
                         <Card>
                            <CardHeader><CardTitle>Análise Item 703</CardTitle></CardHeader>
                            <CardContent className="space-y-2">
                                <SummaryLine label="Soma Total Item" value={analysisResults.summary703['Soma Total Item']} />
                                <SummaryLine label="Total Suspensão" value={analysisResults.summary703['Total Suspensão']} />
                                <SummaryLine label="Soma Líquida Item" value={analysisResults.summary703['Soma Líquida Item']} />
                                 <div className="pt-2 mt-2 border-t">
                                     <h4 className='font-medium text-sm mb-1'>Retenções (Item 703)</h4>
                                      {Object.entries(analysisResults.summary703.Retenções).map(([key, value]) => (
                                         <SummaryLine key={key} label={key} value={value} />
                                     ))}
                                 </div>
                            </CardContent>
                        </Card>
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
                 <Card className="mb-6 bg-muted/50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg"><ListFilter /> Filtros e Opções de Análise</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h3 className='font-medium mb-2'>Desconsiderar Notas</h3>
                                <div className="flex gap-4 items-end">
                                    <div className="flex-grow">
                                        <Label htmlFor="disregarded-notes-input">Número(s) da NFS-e</Label>
                                        <Input id="disregarded-notes-input" placeholder="Ex: 3673 3674" value={noteInput} onChange={(e) => setNoteInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleDisregardNote()} />
                                    </div>
                                    <Button onClick={handleDisregardNote}><FilterX className='h-4 w-4 mr-2'/>Desconsiderar</Button>
                                </div>
                                {disregardedNotes.size > 0 && (
                                    <div className="mt-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="text-sm font-medium">Notas desconsideradas:</h4>
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                                onClick={handleClearAllDisregarded}
                                            >
                                                <X className="h-3 w-3 mr-1" /> Remover Todas
                                            </Button>
                                        </div>
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
                            </div>
                             <div>
                                <h3 className='font-medium mb-2'>Frases de Suspensão Ativas</h3>
                                <div className="space-y-2">
                                    {SUSPENSION_PHRASES.map(phrase => {
                                        const notesForPhrase = getNotesForPhrase(phrase);
                                        return (
                                            <div key={phrase} className="flex items-center justify-between">
                                                <div className='flex items-center space-x-2'>
                                                    <Checkbox id={`phrase-${phrase}`} checked={selectedSuspensionPhrases.has(phrase)} onCheckedChange={(checked) => handleSuspensionPhraseToggle(phrase, !!checked)} />
                                                    <Label htmlFor={`phrase-${phrase}`} className="text-sm font-light leading-none">{phrase}</Label>
                                                </div>
                                                <Dialog>
                                                    <DialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={notesForPhrase.length === 0} title={`Ver ${notesForPhrase.length} notas`}>
                                                            <Eye className="h-4 w-4" />
                                                        </Button>
                                                    </DialogTrigger>
                                                    <DialogContent className="max-w-4xl">
                                                        <DialogHeader>
                                                            <div className="flex justify-between items-center">
                                                                <div>
                                                                    <DialogTitle>Notas com "{phrase}"</DialogTitle>
                                                                    <DialogDescription>
                                                                        Lista de notas que contêm a frase de suspensão selecionada.
                                                                    </DialogDescription>
                                                                </div>
                                                                 <Button onClick={() => handleDownloadExcel(notesForPhrase, `Suspensao_${phrase.replace(/\s/g, '_')}`)} variant="outline" size="sm" disabled={notesForPhrase.length === 0}>
                                                                    <Download className="mr-2 h-4 w-4" /> Baixar
                                                                </Button>
                                                            </div>
                                                        </DialogHeader>
                                                        <div className="max-h-[60vh] overflow-y-auto">
                                                            <table className="w-full text-sm">
                                                                <thead className='sticky top-0 bg-secondary'>
                                                                    <tr className='text-left border-b'>
                                                                        <th className="p-2 font-medium">Nº da Nota</th>
                                                                        <th className="p-2 font-medium">Descrição Completa</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {notesForPhrase.map(note => (
                                                                        <tr key={note.numero_nfse} className="border-b">
                                                                            <td className="p-2 align-top">{note.numero_nfse}</td>
                                                                            <td className="p-2 whitespace-pre-wrap break-words">{highlightText(note.descritivo, phrase)}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </DialogContent>
                                                </Dialog>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                
                <div className='mt-6'>
                    {renderContent()}
                </div>
            </CardContent>
        </Card>
    );
}
