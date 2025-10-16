
"use client";

import { useState, useMemo, useEffect, type ChangeEvent, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileSearch, Archive, AlertCircle, Loader2, Download, AlertTriangle, UploadCloud, Trash2, GitCompareArrows, Save } from "lucide-react";
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/app/data-table";
import { getColumns, getColumnsWithCustomRender } from "@/lib/columns-helper";
import { cfopDescriptions } from "@/lib/cfop";
import type { ProcessedData, SpedInfo } from "@/lib/excel-processor";
import { FileUploadForm } from "@/components/app/file-upload-form";
import { cleanAndToStr } from "@/lib/utils";
import { KeyChecker } from "./key-checker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "../ui/dialog";


// ===============================================================
// Tipos
// ===============================================================
type InconsistentRow = { 
    row: any; 
    originalIndex: number 
};

const readFileAsJson = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = event.target?.result;
                if (!data) throw new Error("Não foi possível ler o conteúdo do arquivo.");
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                if (!sheetName) throw new Error("A planilha não contém nenhuma aba.");
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { range: 8, defval: null });
                resolve(jsonData);
            } catch (err: any) {
                reject(err);
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
};


// ===============================================================
// Constantes e Helpers
// ===============================================================
const inconsistentCfopColumns = ["Número", "Credor", "CPF/CNPJ", "CFOP", "Descricao CFOP", "UF do Fornecedor", "Correção Sugerida"];


const formatCurrency = (value: any) => {
    const num = parseFloat(String(value).replace(',', '.'));
    if (isNaN(num)) return String(value ?? '');
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const normalizeKey = (key: string | undefined): string => {
    if(!key) return '';
    return key.toLowerCase().replace(/[\s-._/]/g, '');
}

// ===============================================================
// Componente Principal
// ===============================================================

interface AdditionalAnalysesProps {
    processedData: ProcessedData;
    onSiengeDataProcessed: (data: any[] | null) => void;
    siengeFile: File | null;
    onSiengeFileChange: (file: File | null) => void;
    onClearSiengeFile: () => void;
    allXmlFiles: File[];
    spedFiles: File[];
    onSpedFilesChange: (files: File[]) => void;
    onSpedProcessed: (spedInfo: SpedInfo | null, keyCheckResults: any | null) => void;
    competence: string | null;
    onExportSession: () => void;
}

export function AdditionalAnalyses({ 
    processedData, 
    onSiengeDataProcessed, 
    siengeFile, 
    onSiengeFileChange, 
    onClearSiengeFile, 
    allXmlFiles,
    spedFiles,
    onSpedFilesChange,
    onSpedProcessed,
    competence,
    onExportSession
}: AdditionalAnalysesProps) {
    const { toast } = useToast();

    const siengeSheetData = processedData.siengeSheetData;
    
    useEffect(() => {
        if (!siengeFile || siengeSheetData) return;
        
        const process = async () => {
            try {
                const data = await readFileAsJson(siengeFile);
                onSiengeDataProcessed(data);
                toast({ title: 'Análise Sienge Concluída', description: 'Os dados foram processados e as abas de conferência foram atualizadas.' });
            } catch (error: any) {
                toast({ variant: 'destructive', title: 'Erro ao Processar Sienge', description: error.message });
                onSiengeDataProcessed(null);
            }
        };
        process();
    }, [siengeFile, siengeSheetData, onSiengeDataProcessed, toast]);

    
    const { reconciliationResults, error: reconciliationError } = useReconciliation(
        processedData.siengeSheetData, 
        processedData.sheets['Itens Válidos']
    );

    const [isExporting, setIsExporting] = useState(false);
    const [resaleAnalysis, setResaleAnalysis] = useState<{ noteKeys: Set<string>; xmls: File[] } | null>(null);
    const [isAnalyzingResale, setIsAnalyzingResale] = useState(false);

    const handleSiengeFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        onSiengeFileChange(file || null);
        if (file) {
            onSiengeDataProcessed(null);
        }
    };
    
    const taxAndReconciliationAnalyses = useMemo(() => {
        if (!siengeSheetData || siengeSheetData.length === 0) {
            return { inconsistentCfopRows: [], taxConferences: { icms: [], pis: [], cofins: [], ipi: [], icmsSt: [] } };
        }
    
        const findHeader = (data: any[], possibleNames: string[]): string | undefined => {
             if (!data || data.length === 0 || !data[0]) return undefined;
             const headers = Object.keys(data[0]);
             const normalizedHeaders = headers.map(h => ({ original: h, normalized: normalizeKey(h) }));
             for (const name of possibleNames) {
                 const normalizedName = normalizeKey(name);
                 const found = normalizedHeaders.find(h => h.normalized === normalizedName);
                 if (found) return found.original;
             }
             return undefined;
        };
    
        const h = {
            uf: findHeader(siengeSheetData, ['uf', 'uf do fornecedor']), 
            cfop: findHeader(siengeSheetData, ['cfop']),
            icms: findHeader(siengeSheetData, ['icms', 'valor icms', 'vlr icms']), 
            pis: findHeader(siengeSheetData, ['pis', 'valor pis', 'vlr pis']),
            cofins: findHeader(siengeSheetData, ['cofins', 'valor cofins', 'vlr cofins']), 
            ipi: findHeader(siengeSheetData, ['ipi', 'valor ipi', 'vlr ipi']),
            icmsSt: findHeader(siengeSheetData, ['icms-st', 'icms st', 'valor icms st', 'vlr icms st', 'vlr icms subst']),
            numero: findHeader(siengeSheetData, ['número', 'numero', 'numero da nota', 'nota fiscal']), 
            fornecedor: findHeader(siengeSheetData, ['credor', 'fornecedor', 'nome do fornecedor']),
            cpfCnpj: findHeader(siengeSheetData, ['cpf/cnpj', 'cpf/cnpj do fornecedor']),
            descricao: findHeader(siengeSheetData, ['descrição', 'descrição do item', 'produto fiscal']),
        };

        const cfopRows: InconsistentRow[] = [];
        const icms: any[] = [], pis: any[] = [], cofins: any[] = [], ipi: any[] = [], icmsSt: any[] = [];
        
        const getCfopDescription = (cfopCode: number): string => {
            const fullDescription = cfopDescriptions[cfopCode];
            if (fullDescription) {
                const nestedDescriptionKey = Object.keys(cfopDescriptions).find(k => cfopDescriptions[Number(k) as keyof typeof cfopDescriptions] === fullDescription);
                if (nestedDescriptionKey) {
                    const nestedDescription = cfopDescriptions[Number(nestedDescriptionKey) as keyof typeof cfopDescriptions];
                    if (nestedDescription && typeof nestedDescription === 'string') {
                         return nestedDescription.split(' ').slice(0, 3).join(' ');
                    }
                }
                return fullDescription.split(' ').slice(0, 3).join(' ');
            }
            return 'N/A';
        };
    
        const getRelevantData = (row: any, taxKey: string | undefined, taxName: string) => {
            if (!taxKey || !row || typeof row !== 'object' || !h.cfop) return null;
            const relevantRow: Record<string, any> = {};
            if(h.numero && h.numero in row) relevantRow["Número"] = row[h.numero];
            if(h.cpfCnpj && h.cpfCnpj in row) relevantRow["CPF/CNPJ"] = row[h.cpfCnpj];
            if(h.fornecedor && h.fornecedor in row) relevantRow["Credor"] = row[h.fornecedor];
            const cfopVal = row[h.cfop] ?? row['CFOP'];
            const cfopCode = parseInt(cleanAndToStr(cfopVal), 10);
            relevantRow["CFOP"] = cfopCode;
            relevantRow["Descricao CFOP"] = getCfopDescription(cfopCode);
            if(taxKey in row) relevantRow[taxName] = row[taxKey];
            if(h.descricao && h.descricao in row) relevantRow["Descrição"] = row[h.descricao];
            return relevantRow;
        }
    
        siengeSheetData.forEach((row, index) => {
            if (!row || typeof row !== 'object') return;
    
            if (h.uf && row[h.uf] && h.cfop) {
                const cfopVal = row[h.cfop] ?? row['CFOP'];
                if(cfopVal) {
                    const uf = String(row[h.uf] || '').toUpperCase().trim();
                    const cfop = String(cfopVal || '').trim();
                    if (uf && cfop) {
                        const isInterstate = uf !== 'PR';
                        const firstDigit = cfop.charAt(0);
                        const cfopCode = parseInt(cfop, 10);
                        const baseRow = {
                            "Número": (h.numero && row[h.numero]) || '', 
                            "Credor": (h.fornecedor && row[h.fornecedor]) || '', 
                            "CPF/CNPJ": (h.cpfCnpj && row[h.cpfCnpj]) || '',
                            "CFOP": cfop,
                            "Descricao CFOP": getCfopDescription(cfopCode),
                            "UF do Fornecedor": uf,
                        };
                        if (isInterstate && firstDigit !== '2' && !['5', '6', '7'].includes(firstDigit)) {
                            cfopRows.push({ row: { ...baseRow, "Correção Sugerida": `2${cfop.substring(1)}` }, originalIndex: index });
                        } else if (!isInterstate && firstDigit !== '1' && !['5', '6', '7'].includes(firstDigit)) {
                             cfopRows.push({ row: { ...baseRow, "Correção Sugerida": `1${cfop.substring(1)}` }, originalIndex: index });
                        }
                    }
                }
            }
    
            if (h.icms && parseFloat(String(row[h.icms] || '0').replace(',', '.')) > 0) icms.push(getRelevantData(row, h.icms, "Valor ICMS")!);
            if (h.pis && parseFloat(String(row[h.pis] || '0').replace(',', '.')) > 0) pis.push(getRelevantData(row, h.pis, "Valor PIS")!);
            if (h.cofins && parseFloat(String(row[h.cofins] || '0').replace(',', '.')) > 0) cofins.push(getRelevantData(row, h.cofins, "Valor COFINS")!);
            if (h.ipi && parseFloat(String(row[h.ipi] || '0').replace(',', '.')) > 0) ipi.push(getRelevantData(row, h.ipi, "Valor IPI")!);
            if (h.icmsSt && parseFloat(String(row[h.icmsSt] || '0').replace(',', '.')) > 0) icmsSt.push(getRelevantData(row, h.icmsSt, "Valor ICMS ST")!);
        });
        
        const uniqueCfopRowsMap = new Map<string, InconsistentRow>();
        cfopRows.forEach(item => {
            const numero = item.row['Número'];
            const cnpj = item.row['CPF/CNPJ'];
            if (numero && cnpj) {
                const key = `${cleanAndToStr(numero)}-${cleanAndToStr(cnpj)}`;
                if (!uniqueCfopRowsMap.has(key)) {
                    uniqueCfopRowsMap.set(key, item);
                }
            }
        });
    
        return { inconsistentCfopRows: Array.from(uniqueCfopRowsMap.values()), taxConferences: { icms, pis, cofins, ipi, icmsSt } };
    }, [siengeSheetData]);

    const handleDownloadConferencia = (data: any[], title: string) => {
        if (!data || data.length === 0) {
            toast({ title: "Nenhum dado para exportar", description: `Não há itens na aba "${title}".` });
            return;
        }
        const dataToExport = data.map(item => item.row || item);
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, title);
        const fileName = `Grantel - Conferência ${title}.xlsx`;
        XLSX.writeFile(workbook, fileName);
    };

    const getTaxFooter = (data: any[], taxName: string): Record<string, string> | undefined => {
        if (!data || data.length === 0) return undefined;
        const total = data.reduce((sum, row) => {
            const value = parseFloat(String(row?.[taxName] || '0').replace(',', '.'));
            return sum + (isNaN(value) ? 0 : value);
        }, 0);
        return { [taxName]: formatCurrency(total) };
    }

    const handleAnalyzeResale = useCallback(async () => {
        if (!siengeFile) {
            toast({ variant: 'destructive', title: "Dados incompletos", description: "Carregue a planilha Sienge primeiro." });
            return;
        }
        if (allXmlFiles.length === 0) {
            toast({ variant: 'destructive', title: "Dados incompletos", description: "Carregue os arquivos XML de entrada primeiro." });
            return;
        }
    
        setIsAnalyzingResale(true);
        setResaleAnalysis(null);
    
        setTimeout(async () => {
            try {
                let localSiengeData = siengeSheetData;
                if (!localSiengeData) {
                    localSiengeData = await readFileAsJson(siengeFile);
                    onSiengeDataProcessed(localSiengeData);
                }
    
                const RESALE_CFOPS = ['1102', '2102', '1403', '2403'];
                
                const findSiengeHeader = (possibleNames: string[]): string | undefined => {
                    if (!localSiengeData || localSiengeData.length === 0 || !localSiengeData[0]) return undefined;
                    const headers = Object.keys(localSiengeData[0]);
                    const normalizedHeaders = headers.map(h => ({ original: h, normalized: normalizeKey(h) }));
                    for (const name of possibleNames) {
                        const normalizedName = normalizeKey(name);
                        const found = normalizedHeaders.find(h => h.normalized === normalizedName);
                        if (found) return found.original;
                    }
                    return undefined;
                };
    
                const h = {
                    cfop: findSiengeHeader(['cfop']),
                    numero: findSiengeHeader(['número', 'numero', 'numero da nota', 'nota fiscal']),
                    cnpj: findSiengeHeader(['cpf/cnpj', 'cpf/cnpj do fornecedor']),
                };
    
                if (!h.cfop || !h.numero || !h.cnpj) {
                    throw new Error("Não foi possível encontrar as colunas 'CFOP', 'Número' e 'CPF/CNPJ' na planilha Sienge.");
                }
    
                const resaleNoteKeys = new Set<string>();
                localSiengeData.forEach(item => {
                    const cfop = cleanAndToStr(item[h.cfop!]);
                    if (RESALE_CFOPS.includes(cfop)) {
                        const numero = cleanAndToStr(item[h.numero!]);
                        const cnpj = String(item[h.cnpj!]).replace(/\D/g, '');
                        if (numero && cnpj) {
                            resaleNoteKeys.add(`${numero}-${cnpj}`);
                        }
                    }
                });
    
                const parser = new DOMParser();
                const NFE_NAMESPACE = "http://www.portalfiscal.inf.br/nfe";
                const matchedXmls: File[] = [];
    
                for (const file of allXmlFiles) {
                    if (!file.name.toLowerCase().endsWith('.xml')) continue;
                    
                    try {
                        const fileContent = await file.text();
                        const xmlDoc = parser.parseFromString(fileContent, "application/xml");
    
                        const getTagValue = (element: Element | undefined, tagName: string): string => {
                            if (!element) return '';
                            const tags = element.getElementsByTagNameNS(NFE_NAMESPACE, tagName);
                            return tags[0]?.textContent ?? '';
                        };
                        
                        const infNFe = xmlDoc.getElementsByTagNameNS(NFE_NAMESPACE, 'infNFe')[0];
                        if (!infNFe) continue;
    
                        const ide = infNFe.getElementsByTagNameNS(NFE_NAMESPACE, 'ide')[0];
                        const emit = infNFe.getElementsByTagNameNS(NFE_NAMESPACE, 'emit')[0];
                        if (!ide || !emit) continue;
                        
                        const numero = cleanAndToStr(getTagValue(ide, 'nNF'));
                        const cnpj = cleanAndToStr(getTagValue(emit, 'CNPJ'));
                        
                        if (numero && cnpj) {
                            const compositeKey = `${numero}-${cnpj}`;
                            if (resaleNoteKeys.has(compositeKey)) {
                                matchedXmls.push(file);
                            }
                        }
                    } catch (e) {
                         console.warn(`Could not parse XML content for file ${file.name}:`, e);
                    }
                }
                
                setResaleAnalysis({ noteKeys: resaleNoteKeys, xmls: matchedXmls });
                toast({ title: "Análise de Revenda Concluída", description: `${matchedXmls.length} XMLs correspondentes encontrados.` });
    
            } catch (error: any) {
                toast({ variant: 'destructive', title: "Erro na Análise de Revenda", description: error.message });
                setResaleAnalysis(null);
            } finally {
                setIsAnalyzingResale(false);
            }
        }, 50);
    
    }, [siengeFile, siengeSheetData, allXmlFiles, toast, onSiengeDataProcessed]);


    const handleExportResaleXmls = async () => {
        if (!resaleAnalysis || resaleAnalysis.xmls.length === 0) {
            toast({ title: "Nenhum XML de revenda encontrado", description: "Execute a análise primeiro." });
            return;
        }

        setIsExporting(true);
        toast({ title: "Exportação Iniciada", description: `A compactar ${resaleAnalysis.xmls.length} ficheiros XML. Por favor, aguarde.` });

        try {
            const zip = new JSZip();
            for (const file of resaleAnalysis.xmls) {
                const content = await file.text();
                zip.file(file.name, content);
            }
            const zipBlob = await zip.generateAsync({ type: "blob" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(zipBlob);
            link.download = "Grantel_XMLs_Revenda.zip";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
        } catch(error) {
             toast({ variant: "destructive", title: "Erro ao Exportar", description: "Ocorreu um erro ao criar o ficheiro .zip." });
             console.error("Zip Export Error:", error);
        } finally {
            setIsExporting(false);
        }
    };
    

    return (
        <div className="space-y-6">
             <Card>
                <CardHeader>
                     <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className='flex items-center gap-3'>
                             <FileSearch className="h-8 w-8 text-primary" />
                             <div>
                                <CardTitle className="font-headline text-2xl">Análises Avançadas</CardTitle>
                                <CardDescription>Execute análises de conciliação, exporte relatórios e guarde a sessão.</CardDescription>
                            </div>
                        </div>
                         <Button onClick={onExportSession} disabled={!competence}>
                            <Save className="mr-2 h-4 w-4" /> Exportar Sessão (.json)
                        </Button>
                    </div>
                </CardHeader>
             </Card>

            <Tabs defaultValue="sped" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="sped">Verificação SPED</TabsTrigger>
                    <TabsTrigger value="reconciliation">Conciliação Itens (XML x Sienge)</TabsTrigger>
                    <TabsTrigger value="conferencias">Conferência (Sienge)</TabsTrigger>
                </TabsList>

                <TabsContent value="sped" className="mt-6">
                     <KeyChecker 
                        chavesValidas={processedData.sheets['Chaves Válidas'] || []}
                        spedFiles={spedFiles}
                        onFilesChange={onSpedFilesChange}
                        onSpedProcessed={onSpedProcessed}
                        initialSpedInfo={processedData.spedInfo}
                        initialKeyCheckResults={processedData.keyCheckResults}
                        nfeEntradaData={processedData.sheets['Notas Válidas'] || []}
                        cteData={processedData.sheets['CTEs Válidos'] || []}
                    />
                </TabsContent>
                
                 <TabsContent value="reconciliation" className="mt-6">
                    <ReconciliationAnalysis 
                        siengeFile={siengeFile}
                        onSiengeFileChange={handleSiengeFileChange}
                        onClearSiengeFile={onClearSiengeFile}
                        reconciliationResults={reconciliationResults}
                        error={reconciliationError}
                    />
                </TabsContent>

                <TabsContent value="conferencias" className="mt-6 space-y-6">
                     <Card>
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <UploadCloud className="h-8 w-8 text-primary" />
                                <div>
                                    <CardTitle className="font-headline text-2xl">Carregar Planilha Sienge</CardTitle>
                                    <CardDescription>Carregue a planilha "Itens do Sienge" para analisar as inconsistências de impostos e identificar notas de revenda.</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                             <FileUploadForm
                                requiredFiles={['Itens do Sienge']}
                                files={{ 'Itens do Sienge': !!siengeFile }}
                                onFileChange={handleSiengeFileChange}
                                onClearFile={onClearSiengeFile}
                            />
                        </CardContent>
                    </Card>
                    
                    <Tabs defaultValue="tax_check" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                           <TabsTrigger value="tax_check">Conferência de Impostos</TabsTrigger>
                           <TabsTrigger value="resale_export">Exportação de Revenda</TabsTrigger>
                        </TabsList>

                        <TabsContent value="tax_check" className="mt-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Resultados da Conferência de Impostos</CardTitle>
                                    <CardDescription>Listagem de todos os itens da planilha Sienge que possuem valores nos campos de impostos.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {siengeSheetData && siengeSheetData.length > 0 ? (
                                        <Tabs defaultValue="cfop_uf">
                                            <TabsList className="h-auto flex-wrap justify-start">
                                                <TabsTrigger value="cfop_uf">CFOP/UF ({taxAndReconciliationAnalyses.inconsistentCfopRows.length})</TabsTrigger>
                                                <TabsTrigger value="icms">ICMS ({taxAndReconciliationAnalyses.taxConferences.icms.length})</TabsTrigger>
                                                <TabsTrigger value="pis">PIS ({taxAndReconciliationAnalyses.taxConferences.pis.length})</TabsTrigger>
                                                <TabsTrigger value="cofins">COFINS ({taxAndReconciliationAnalyses.taxConferences.cofins.length})</TabsTrigger>
                                                <TabsTrigger value="ipi">IPI ({taxAndReconciliationAnalyses.taxConferences.ipi.length})</TabsTrigger>
                                                <TabsTrigger value="icms_st">ICMS ST ({taxAndReconciliationAnalyses.taxConferences.icmsSt.length})</TabsTrigger>
                                            </TabsList>
                                            <TabsContent value="cfop_uf" className="mt-4">
                                                <Button onClick={() => handleDownloadConferencia(taxAndReconciliationAnalyses.inconsistentCfopRows.map(r => r.row), 'CFOP_UF_Inconsistencias')} size="sm" className="mb-4" disabled={taxAndReconciliationAnalyses.inconsistentCfopRows.length === 0}><Download className="mr-2 h-4 w-4" /> Baixar Inconsistências</Button>
                                                <DataTable columns={getColumnsWithCustomRender(taxAndReconciliationAnalyses.inconsistentCfopRows.map(r => r.row), inconsistentCfopColumns)} data={taxAndReconciliationAnalyses.inconsistentCfopRows.map(r => r.row)} />
                                            </TabsContent>
                                            <TabsContent value="icms" className="mt-4">
                                                <Button onClick={() => handleDownloadConferencia(taxAndReconciliationAnalyses.taxConferences.icms, 'ICMS')} size="sm" className="mb-4" disabled={taxAndReconciliationAnalyses.taxConferences.icms.length === 0}><Download className="mr-2 h-4 w-4" /> Baixar</Button>
                                                <DataTable columns={getColumns(taxAndReconciliationAnalyses.taxConferences.icms)} data={taxAndReconciliationAnalyses.taxConferences.icms} footer={getTaxFooter(taxAndReconciliationAnalyses.taxConferences.icms, 'Valor ICMS')} />
                                            </TabsContent>
                                            <TabsContent value="pis" className="mt-4">
                                                <Button onClick={() => handleDownloadConferencia(taxAndReconciliationAnalyses.taxConferences.pis, 'PIS')} size="sm" className="mb-4" disabled={taxAndReconciliationAnalyses.taxConferences.pis.length === 0}><Download className="mr-2 h-4 w-4" /> Baixar</Button>
                                                <DataTable columns={getColumns(taxAndReconciliationAnalyses.taxConferences.pis)} data={taxAndReconciliationAnalyses.taxConferences.pis} footer={getTaxFooter(taxAndReconciliationAnalyses.taxConferences.pis, 'Valor PIS')} />
                                            </TabsContent>
                                            <TabsContent value="cofins" className="mt-4">
                                                <Button onClick={() => handleDownloadConferencia(taxAndReconciliationAnalyses.taxConferences.cofins, 'COFINS')} size="sm" className="mb-4" disabled={taxAndReconciliationAnalyses.taxConferences.cofins.length === 0}><Download className="mr-2 h-4 w-4" /> Baixar</Button>
                                                <DataTable columns={getColumns(taxAndReconciliationAnalyses.taxConferences.cofins)} data={taxAndReconciliationAnalyses.taxConferences.cofins} footer={getTaxFooter(taxAndReconciliationAnalyses.taxConferences.cofins, 'Valor COFINS')} />
                                            </TabsContent>
                                            <TabsContent value="ipi" className="mt-4">
                                                <Button onClick={() => handleDownloadConferencia(taxAndReconciliationAnalyses.taxConferences.ipi, 'IPI')} size="sm" className="mb-4" disabled={taxAndReconciliationAnalyses.taxConferences.ipi.length === 0}><Download className="mr-2 h-4 w-4" /> Baixar</Button>
                                                <DataTable columns={getColumns(taxAndReconciliationAnalyses.taxConferences.ipi)} data={taxAndReconciliationAnalyses.taxConferences.ipi} footer={getTaxFooter(taxAndReconciliationAnalyses.taxConferences.ipi, 'Valor IPI')} />
                                            </TabsContent>
                                            <TabsContent value="icms_st" className="mt-4">
                                                <Button onClick={() => handleDownloadConferencia(taxAndReconciliationAnalyses.taxConferences.icmsSt, 'ICMS_ST')} size="sm" className="mb-4" disabled={taxAndReconciliationAnalyses.taxConferences.icmsSt.length === 0}><Download className="mr-2 h-4 w-4" /> Baixar</Button>
                                                <DataTable columns={getColumns(taxAndReconciliationAnalyses.taxConferences.icmsSt)} data={taxAndReconciliationAnalyses.taxConferences.icmsSt} footer={getTaxFooter(taxAndReconciliationAnalyses.taxConferences.icmsSt, 'Valor ICMS ST')} />
                                            </TabsContent>
                                        </Tabs>
                                    ) : (
                                        <div className="p-8 text-center text-muted-foreground"><AlertTriangle className="mx-auto h-12 w-12 mb-4" /><h3 className="text-xl font-semibold mb-2">Nenhum dado para analisar</h3><p>Carregue la planilha "Itens do Sienge" acima para iniciar a análise de conferências.</p></div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                         <TabsContent value="resale_export" className="mt-6">
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center gap-3">
                                        <Archive className="h-8 w-8 text-primary" />
                                        <div>
                                            <CardTitle>Exportar XMLs de Revenda</CardTitle>
                                            <CardDescription>
                                                Identifique e baixe um arquivo .zip com os XMLs de notas fiscais classificadas com CFOP de revenda no relatório do Sienge.
                                            </CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {!siengeSheetData ? (
                                        <div className="p-8 text-center text-muted-foreground">
                                            <AlertTriangle className="mx-auto h-12 w-12 mb-4" />
                                            <h3 className="text-xl font-semibold mb-2">Aguardando dados Sienge</h3>
                                            <p>Analise a planilha "Itens do Sienge" para identificar as notas de revenda.</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-start gap-4">
                                            <Button onClick={handleAnalyzeResale} disabled={isAnalyzingResale || isExporting}>
                                                {isAnalyzingResale ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Analisando...</> : "Analisar XMLs para Revenda"}
                                            </Button>

                                            {resaleAnalysis && (
                                                <div className="mt-4 w-full">
                                                    <p className="text-sm text-muted-foreground">
                                                        Foram encontradas <span className="font-bold text-foreground">{resaleAnalysis.noteKeys.size}</span> chaves de revenda no Sienge.
                                                        Destas, <span className="font-bold text-foreground">{resaleAnalysis.xmls.length}</span> ficheiros XML correspondentes foram encontrados e estão prontos para exportação.
                                                    </p>
                                                    <Button onClick={handleExportResaleXmls} disabled={isExporting || resaleAnalysis.xmls.length === 0} className="mt-4">
                                                        {isExporting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> A compactar...</> : `Baixar ${resaleAnalysis.xmls.length} XMLs de Revenda`}
                                                    </Button>
                                                    {resaleAnalysis.xmls.length === 0 && resaleAnalysis.noteKeys.size > 0 && (
                                                        <Alert variant="destructive" className="mt-4">
                                                            <AlertCircle className="h-4 w-4" />
                                                            <AlertTitle>XMLs não encontrados</AlertTitle>
                                                            <AlertDescription>
                                                                Apesar de as notas de revenda terem sido identificadas no Sienge, os ficheiros XML correspondentes não foram encontrados entre os ficheiros carregados. Verifique se o nome dos XMLs contém a chave de 44 dígitos.
                                                            </AlertDescription>
                                                        </Alert>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </TabsContent>
            </Tabs>
        </div>
    );
}

// ===============================================================
// Componente de Análise de Conciliação e Hook
// ===============================================================

interface ReconciliationAnalysisProps {
    siengeFile: File | null;
    onSiengeFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
    onClearSiengeFile: () => void;
    reconciliationResults: { reconciled: any[], onlyInSienge: any[], onlyInXml: any[] } | null;
    error: string | null;
}

function ReconciliationAnalysis({ siengeFile, onSiengeFileChange, onClearSiengeFile, reconciliationResults, error }: ReconciliationAnalysisProps) {
    const { toast } = useToast();
    
    useEffect(() => {
        if (error) {
            toast({ variant: 'destructive', title: "Erro na Conciliação", description: error });
        }
    }, [error, toast]);


    const handleDownload = (data: any[], title: string) => {
        if (!data || data.length === 0) {
            toast({ title: "Nenhum dado para exportar", description: `Não há itens na aba "${title}".` });
            return;
        }
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, title);
        const fileName = `Grantel - Conciliação ${title}.xlsx`;
        XLSX.writeFile(workbook, fileName);
    };

    return (
         <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <GitCompareArrows className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="font-headline text-2xl">Conciliação de Itens (XML vs Sienge)</CardTitle>
                            <CardDescription>Carregue a planilha do Sienge. A comparação será executada automaticamente.</CardDescription>
                        </div>
                    </div>
                     <Dialog>
                        <DialogTrigger asChild>
                             <Button disabled={!reconciliationResults || reconciliationResults.reconciled.length === 0}>
                                Validar CFOP dos Itens Conciliados
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-[95vw] h-[90vh] flex flex-col">
                            <DialogHeader>
                                <DialogTitle>Validação de CFOP dos Itens Conciliados</DialogTitle>
                                <DialogDescription>
                                    Classifique os itens e verifique se o CFOP lançado no Sienge está correto. As classificações são guardadas automaticamente.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="flex-grow overflow-auto">
                                {/* O componente CfopValidator será colocado aqui */}
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <FileUploadForm
                    requiredFiles={['Itens do Sienge']}
                    files={{ 'Itens do Sienge': !!siengeFile }}
                    onFileChange={onSiengeFileChange}
                    onClearFile={onClearSiengeFile}
                />
                
                {reconciliationResults ? (
                    <div className="mt-6">
                        <Tabs defaultValue="reconciled">
                            <TabsList className="h-auto flex-wrap justify-start">
                                <TabsTrigger value="reconciled">Conciliados ({reconciliationResults.reconciled.length})</TabsTrigger>
                                <TabsTrigger value="onlyInSienge">Apenas no Sienge ({reconciliationResults.onlyInSienge.length})</TabsTrigger>
                                <TabsTrigger value="onlyInXml">Apenas no XML ({reconciliationResults.onlyInXml.length})</TabsTrigger>
                            </TabsList>
                            <div className="mt-4">
                                <TabsContent value="reconciled">
                                    <Button onClick={() => handleDownload(reconciliationResults.reconciled, 'Itens_Conciliados')} size="sm" className="mb-4" disabled={reconciliationResults.reconciled.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                    <DataTable columns={getColumns(reconciliationResults.reconciled)} data={reconciliationResults.reconciled} />
                                </TabsContent>
                                <TabsContent value="onlyInSienge">
                                    <Button onClick={() => handleDownload(reconciliationResults.onlyInSienge, 'Itens_Apenas_Sienge')} size="sm" className="mb-4" disabled={reconciliationResults.onlyInSienge.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                    <DataTable columns={getColumns(reconciliationResults.onlyInSienge)} data={reconciliationResults.onlyInSienge} />
                                </TabsContent>
                                <TabsContent value="onlyInXml">
                                    <Button onClick={() => handleDownload(reconciliationResults.onlyInXml, 'Itens_Apenas_XML')} size="sm" className="mb-4" disabled={reconciliationResults.onlyInXml.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                    <DataTable columns={getColumns(reconciliationResults.onlyInXml)} data={reconciliationResults.onlyInXml} />
                                </TabsContent>
                            </div>
                        </Tabs>
                    </div>
                ) : (
                     <div className="flex flex-col items-center justify-center min-h-[300px] text-muted-foreground border-2 border-dashed rounded-lg p-8">
                        <Loader2 className="h-12 w-12 animate-spin text-primary" />
                        <p className="mt-4 text-center">Aguardando o ficheiro "Itens do Sienge" para executar a conciliação automaticamente...</p>
                    </div>
                )}

                 {error && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Erro na Análise de Conciliação</AlertTitle>
                        <AlertDescription>
                            {error}
                        </AlertDescription>
                    </Alert>
                )}
            </CardContent>
         </Card>
    );
}

// ===============================================================
// Lógica de Conciliação
// ===============================================================

function useReconciliation(siengeData: any[] | null, xmlItems: any[] | null) {
    return useMemo(() => {
        if (!siengeData || !xmlItems) {
            return { reconciliationResults: null, error: null };
        }

        try {
            const findHeader = (data: any[], possibleNames: string[]): string | undefined => {
                if (!data || data.length === 0 || !data[0]) return undefined;
                const headers = Object.keys(data[0]);
                const normalizedHeaders = headers.map(h => ({ original: h, normalized: normalizeKey(h) }));
                for (const name of possibleNames) {
                    const normalizedName = normalizeKey(name);
                    const found = normalizedHeaders.find(h => h.normalized === normalizedName);
                    if (found) return found.original;
                }
                return undefined;
            };

            const espHeader = findHeader(siengeData, ['esp']);
            if (!espHeader) {
                throw new Error("Não foi possível encontrar a coluna 'Esp' na planilha Sienge para filtragem.");
            }

            const filteredSiengeData = siengeData.filter(row => {
                const espValue = row[espHeader] ? String(row[espHeader]).trim().toUpperCase() : '';
                return espValue === 'NFE' || espValue === 'NFSR';
            });

            const h = {
                cnpj: findHeader(filteredSiengeData, ['cpf/cnpj', 'cpf/cnpj do fornecedor']),
                numero: findHeader(filteredSiengeData, ['número', 'numero', 'numero da nota', 'nota fiscal']),
                valorTotal: findHeader(filteredSiengeData, ['valor total', 'valor', 'vlr total']),
                icmsOutras: findHeader(filteredSiengeData, ['icms outras', 'icmsoutras']),
                desconto: findHeader(filteredSiengeData, ['desconto']),
                frete: findHeader(filteredSiengeData, ['frete']),
                ipiDespesas: findHeader(filteredSiengeData, ['ipi despesas', 'ipidespesas']),
                icmsSt: findHeader(filteredSiengeData, ['icms-st', 'icms st', 'valor icms st', 'vlr icms st', 'vlr icms subst']),
                despesasAcessorias: findHeader(filteredSiengeData, ['despesas acessórias', 'despesasacessorias', 'voutro']),
                precoUnitario: findHeader(filteredSiengeData, ['preço unitário', 'preco unitario', 'valor unitario', 'vlr unitario']),
                produtoFiscal: findHeader(filteredSiengeData, ['produto fiscal', 'descrição do item', 'descrição']),
            };

            if (!h.cnpj || !h.numero || !h.valorTotal) {
                throw new Error("Não foi possível encontrar as colunas essenciais ('Número', 'CPF/CNPJ', 'Valor Total') na planilha Sienge.");
            }

            const getComparisonKey = (numero: any, cnpj: any, valor: any): string | null => {
                const cleanNumero = cleanAndToStr(numero);
                const cleanCnpj = String(cnpj).replace(/\D/g, '');
                const cleanValor = parseFloat(String(valor || '0').replace(',', '.')).toFixed(2);
                if (!cleanNumero || !cleanCnpj || cleanValor === 'NaN') return null;
                return `${cleanNumero}-${cleanCnpj}-${cleanValor}`;
            };

            const reconciled: any[] = [];
            let remainingXmlItems = [...xmlItems];
            let remainingSiengeItems = [...filteredSiengeData];

            const reconciliationPass = (
                siengeItems: any[],
                xmlItems: any[],
                getSiengeKey: (item: any) => string | null,
                getXmlKey: (item: any) => string | null,
                passName: string
            ) => {
                const matchedInPass: any[] = [];
                const stillUnmatchedSienge: any[] = [];
                const xmlMap = new Map<string, any[]>();

                xmlItems.forEach(item => {
                    const key = getXmlKey(item);
                    if (key) {
                        if (!xmlMap.has(key)) xmlMap.set(key, []);
                        xmlMap.get(key)!.push(item);
                    }
                });

                siengeItems.forEach(siengeItem => {
                    const key = getSiengeKey(siengeItem);
                    if (key && xmlMap.has(key)) {
                        const matchedXmlItems = xmlMap.get(key)!;
                        if (matchedXmlItems.length > 0) {
                            const matchedXmlItem = matchedXmlItems.shift(); // Take one match
                            if (matchedXmlItems.length === 0) {
                                xmlMap.delete(key);
                            }
                            matchedInPass.push({ ...matchedXmlItem, ...Object.fromEntries(Object.entries(siengeItem).map(([k, v]) => [`Sienge_${k}`, v])), 'Observações': `Conciliado via ${passName}` });
                            return; // Sienge item is matched, move to next
                        }
                    }
                    stillUnmatchedSienge.push(siengeItem);
                });

                const stillUnmatchedXml = Array.from(xmlMap.values()).flat();
                return { matched: matchedInPass, remainingSienge: stillUnmatchedSienge, remainingXml: stillUnmatchedXml };
            };

            // Pass 1: Valor Total
            let result = reconciliationPass(remainingSiengeItems, remainingXmlItems,
                (item) => getComparisonKey(item[h.numero!], item[h.cnpj!], item[h.valorTotal!]),
                (item) => getComparisonKey(item['Número da Nota'], item['CPF/CNPJ do Emitente'], item['Valor Total']),
                "Valor Total"
            );
            reconciled.push(...result.matched);
            remainingSiengeItems = result.remainingSienge;
            remainingXmlItems = result.remainingXml;

            // Pass 2: ICMS Outras
            if (h.icmsOutras) {
                result = reconciliationPass(remainingSiengeItems, remainingXmlItems,
                    (item) => getComparisonKey(item[h.numero!], item[h.cnpj!], item[h.icmsOutras!]),
                    (item) => getComparisonKey(item['Número da Nota'], item['CPF/CNPJ do Emitente'], item['Valor Total']),
                    "ICMS Outras"
                );
                reconciled.push(...result.matched);
                remainingSiengeItems = result.remainingSienge;
                remainingXmlItems = result.remainingXml;
            }

            // Pass 3: Valor Total + Desconto
            if (h.desconto) {
                result = reconciliationPass(remainingSiengeItems, remainingXmlItems,
                    (item) => getComparisonKey(
                        item[h.numero!],
                        item[h.cnpj!],
                        parseFloat(String(item[h.valorTotal!] || '0').replace(',', '.')) + parseFloat(String(item[h.desconto!] || '0').replace(',', '.'))
                    ),
                    (item) => getComparisonKey(item['Número da Nota'], item['CPF/CNPJ do Emitente'], item['Valor Total']),
                    "Valor Total + Desconto"
                );
                reconciled.push(...result.matched);
                remainingSiengeItems = result.remainingSienge;
                remainingXmlItems = result.remainingXml;
            }

            // Pass 4: Valor Total - Frete
            if (h.frete) {
                result = reconciliationPass(remainingSiengeItems, remainingXmlItems,
                    (item) => getComparisonKey(
                        item[h.numero!],
                        item[h.cnpj!],
                        parseFloat(String(item[h.valorTotal!] || '0').replace(',', '.')) - parseFloat(String(item[h.frete!] || '0').replace(',', '.'))
                    ),
                    (item) => getComparisonKey(item['Número da Nota'], item['CPF/CNPJ do Emitente'], item['Valor Total']),
                    "Valor Total - Frete"
                );
                reconciled.push(...result.matched);
                remainingSiengeItems = result.remainingSienge;
                remainingXmlItems = result.remainingXml;
            }

            // Pass 5: Valor Total - IPI Despesas - ICMS ST
            if (h.ipiDespesas || h.icmsSt) {
                result = reconciliationPass(remainingSiengeItems, remainingXmlItems,
                    (item) => getComparisonKey(
                        item[h.numero!],
                        item[h.cnpj!],
                        parseFloat(String(item[h.valorTotal!] || '0').replace(',', '.'))
                        - (h.ipiDespesas ? parseFloat(String(item[h.ipiDespesas] || '0').replace(',', '.')) : 0)
                        - (h.icmsSt ? parseFloat(String(item[h.icmsSt] || '0').replace(',', '.')) : 0)
                    ),
                    (item) => getComparisonKey(item['Número da Nota'], item['CPF/CNPJ do Emitente'], item['Valor Total']),
                    "Valor Total - IPI/ICMS ST"
                );
                reconciled.push(...result.matched);
                remainingSiengeItems = result.remainingSienge;
                remainingXmlItems = result.remainingXml;
            }

            // Pass 6: Valor Total - Frete - IPI Despesas
            if (h.frete || h.ipiDespesas) {
                result = reconciliationPass(remainingSiengeItems, remainingXmlItems,
                    (item) => getComparisonKey(
                        item[h.numero!],
                        item[h.cnpj!],
                        parseFloat(String(item[h.valorTotal!] || '0').replace(',', '.'))
                        - (h.frete ? parseFloat(String(item[h.frete] || '0').replace(',', '.')) : 0)
                        - (h.ipiDespesas ? parseFloat(String(item[h.ipiDespesas] || '0').replace(',', '.')) : 0)
                    ),
                    (item) => getComparisonKey(item['Número da Nota'], item['CPF/CNPJ do Emitente'], item['Valor Total']),
                    "Valor Total - Frete/IPI"
                );
                reconciled.push(...result.matched);
                remainingSiengeItems = result.remainingSienge;
                remainingXmlItems = result.remainingXml;
            }

            // Pass 7: Valor Total + Desconto - Frete
            if (h.desconto || h.frete) {
                result = reconciliationPass(remainingSiengeItems, remainingXmlItems,
                    (item) => getComparisonKey(
                        item[h.numero!],
                        item[h.cnpj!],
                        parseFloat(String(item[h.valorTotal!] || '0').replace(',', '.'))
                        + (h.desconto ? parseFloat(String(item[h.desconto] || '0').replace(',', '.')) : 0)
                        - (h.frete ? parseFloat(String(item[h.frete] || '0').replace(',', '.')) : 0)
                    ),
                    (item) => getComparisonKey(item['Número da Nota'], item['CPF/CNPJ do Emitente'], item['Valor Total']),
                    "Valor Total + Desc - Frete"
                );
                reconciled.push(...result.matched);
                remainingSiengeItems = result.remainingSienge;
                remainingXmlItems = result.remainingXml;
            }

            // Pass 8: Valor Total - Despesas Acessórias
            if (h.despesasAcessorias) {
                result = reconciliationPass(remainingSiengeItems, remainingXmlItems,
                    (item) => getComparisonKey(
                        item[h.numero!],
                        item[h.cnpj!],
                        parseFloat(String(item[h.valorTotal!] || '0').replace(',', '.')) - parseFloat(String(item[h.despesasAcessorias!] || '0').replace(',', '.'))
                    ),
                    (item) => getComparisonKey(item['Número da Nota'], item['CPF/CNPJ do Emitente'], item['Valor Total']),
                    "Valor Total - Desp. Acess."
                );
                reconciled.push(...result.matched);
                remainingSiengeItems = result.remainingSienge;
                remainingXmlItems = result.remainingXml;
            }

            // Pass 9: Preço Unitário
            if (h.precoUnitario) {
                result = reconciliationPass(remainingSiengeItems, remainingXmlItems,
                    (item) => getComparisonKey(item[h.numero!], item[h.cnpj!], item[h.precoUnitario!]),
                    (item) => getComparisonKey(item['Número da Nota'], item['CPF/CNPJ do Emitente'], item['Valor Unitário']),
                    "Preço Unitário"
                );
                reconciled.push(...result.matched);
                remainingSiengeItems = result.remainingSienge;
                remainingXmlItems = result.remainingXml;
            }

            // Pass 10: Agregação por Produto Fiscal
            if (h.produtoFiscal && h.valorTotal) {
                const groupAndSum = (items: any[], notaKey: string, cnpjKey: string, productKey: string, valueKey: string) => {
                    const grouped = new Map<string, { items: any[], sum: number }>();
                    items.forEach(item => {
                        const key = `${item[notaKey]}-${item[cnpjKey]}-${item[productKey]}`;
                        if (!grouped.has(key)) {
                            grouped.set(key, { items: [], sum: 0 });
                        }
                        const group = grouped.get(key)!;
                        group.items.push(item);
                        group.sum += parseFloat(String(item[valueKey] || '0').replace(',', '.'));
                    });
                    return grouped;
                };

                const siengeGrouped = groupAndSum(remainingSiengeItems, h.numero!, h.cnpj!, h.produtoFiscal!, h.valorTotal!);
                const xmlGrouped = groupAndSum(remainingXmlItems, 'Número da Nota', 'CPF/CNPJ do Emitente', 'Descrição', 'Valor Total');

                const stillUnmatchedSienge = new Set(remainingSiengeItems);
                const stillUnmatchedXml = new Set(remainingXmlItems);

                siengeGrouped.forEach((siengeGroup, key) => {
                    const xmlGroup = xmlGrouped.get(key);
                    if (xmlGroup && Math.abs(siengeGroup.sum - xmlGroup.sum) < 0.01) {
                        // Match found, aggregate and add to reconciled
                        const aggregate = (items: any[], valueKey: string) => {
                            return items.reduce((acc, item, index) => {
                                if (index === 0) return { ...item };
                                Object.keys(item).forEach(k => {
                                    if (typeof item[k] === 'number' && k !== 'Número da Nota') {
                                        acc[k] = (acc[k] || 0) + item[k];
                                    }
                                });
                                acc[valueKey] = (acc[valueKey] || 0) + item[valueKey];
                                return acc;
                            }, {});
                        };

                        const aggregatedSienge = aggregate(siengeGroup.items, h.valorTotal!);
                        const aggregatedXml = aggregate(xmlGroup.items, 'Valor Total');
                        
                        const reconciledRow = {
                            ...aggregatedXml,
                            ...Object.fromEntries(Object.entries(aggregatedSienge).map(([k, v]) => [`Sienge_${k}`, v])),
                            'Observações': `Conciliado por Agregação de Produto (${siengeGroup.items.length} itens)`,
                            'Valor Total': aggregatedXml['Valor Total'], // Ensure correct total is displayed
                            'Quantidade': siengeGroup.items.reduce((sum, i) => sum + (parseFloat(String(i['Qtde'] || '0').replace(',', '.')) || 0), 0)
                        };
                        reconciled.push(reconciledRow);

                        // Remove matched items from the 'unmatched' sets
                        siengeGroup.items.forEach(item => stillUnmatchedSienge.delete(item));
                        xmlGroup.items.forEach(item => stillUnmatchedXml.delete(item));
                    }
                });

                remainingSiengeItems = Array.from(stillUnmatchedSienge);
                remainingXmlItems = Array.from(stillUnmatchedXml);
            }

            return { reconciliationResults: { reconciled, onlyInSienge: remainingSiengeItems, onlyInXml: remainingXmlItems }, error: null };
        } catch (err: any) {
            return { reconciliationResults: null, error: err.message };
        }
    }, [siengeData, xmlItems]);
}
