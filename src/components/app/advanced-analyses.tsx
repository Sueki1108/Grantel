"use client";

import { useState, type ChangeEvent, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileSearch, Archive, AlertCircle, Loader2, Download, AlertTriangle, UploadCloud, GitCompareArrows, Save, FileJson } from "lucide-react";
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/app/data-table";
import { getColumns } from "@/components/app/columns-helper";
import type { ProcessedData, SpedInfo, SpedCorrectionResult } from "@/lib/excel-processor";
import { FileUploadForm } from "@/components/app/file-upload-form";
import { cleanAndToStr, normalizeKey } from "@/lib/utils";
import { KeyChecker } from "./key-checker";
import { SiengeTaxCheck } from "./sienge-tax-check";

// ===============================================================
// Componente Principal
// ===============================================================

interface AdvancedAnalysesProps {
    processedData: ProcessedData;
    onSiengeFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
    onClearSiengeFile: () => void;
    siengeFile: File | null;
    allXmlFiles: File[];
    spedFiles: File[];
    onSpedFilesChange: (files: File[]) => void;
    onSpedProcessed: (spedInfo: SpedInfo | null, keyCheckResults: any | null, spedCorrections: SpedCorrectionResult | null) => void;
    competence: string | null;
    onExportSession: () => void;
}

export function AdvancedAnalyses({ 
    processedData, 
    onSiengeFileChange, 
    onClearSiengeFile, 
    siengeFile, 
    allXmlFiles,
    spedFiles,
    onSpedFilesChange,
    onSpedProcessed,
    competence,
    onExportSession,
}: AdvancedAnalysesProps) {
    const { toast } = useToast();
    
    const reconciliationResults = processedData.reconciliationResults;

    const [isExporting, setIsExporting] = useState(false);
    const [resaleAnalysis, setResaleAnalysis] = useState<{ noteKeys: Set<string>; xmls: File[] } | null>(null);
    const [isAnalyzingResale, setIsAnalyzingResale] = useState(false);
    
    
    const handleAnalyzeResale = useCallback(async () => {
        const siengeData = processedData.siengeSheetData;
        if (!siengeData) {
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
                const RESALE_CFOPS = ['1102', '2102', '1403', '2403'];
                
                const findSiengeHeader = (data: any[], possibleNames: string[]): string | undefined => {
                    if (data.length === 0 || !data[0]) return undefined;
                    const headers = Object.keys(data[0]);
                    for (const name of possibleNames) {
                        const normalizedName = normalizeKey(name);
                        const found = headers.find(h => normalizeKey(h) === normalizedName);
                        if (found) return found;
                    }
                    return undefined;
                };
    
                const h = {
                    cfop: findSiengeHeader(siengeData, ['cfop']),
                    numero: findSiengeHeader(siengeData, ['número', 'numero', 'numerodanota', 'notafiscal']),
                    cnpj: findSiengeHeader(siengeData, ['cpf/cnpj', 'cpf/cnpj do fornecedor']),
                };
    
                if (!h.cfop || !h.numero || !h.cnpj) {
                    throw new Error("Não foi possível encontrar as colunas 'CFOP', 'Número' e 'CPF/CNPJ' na planilha Sienge.");
                }
    
                const resaleNoteKeys = new Set<string>();
                siengeData.forEach(item => {
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
    
    }, [processedData.siengeSheetData, allXmlFiles, toast]);


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

    const handleDownloadConciliacao = (data: any[], title: string) => {
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
        <div className="space-y-6">
             <Card>
                <CardHeader>
                     <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className='flex items-center gap-3'>
                             <FileSearch className="h-8 w-8 text-primary" />
                             <div>
                                <CardTitle className="font-headline text-2xl">Análises Avançadas</CardTitle>
                                <CardDescription>Execute análises de conciliação, verificação SPED e exporte relatórios.</CardDescription>
                            </div>
                        </div>
                        <Button onClick={onExportSession} size="sm" variant="outline"><FileJson className="mr-2 h-4 w-4"/>Exportar Sessão Atual</Button>
                    </div>
                </CardHeader>
             </Card>

            <Tabs defaultValue="sped" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="sped">Verificação SPED</TabsTrigger>
                    <TabsTrigger value="reconciliation">Conciliação XML x Sienge</TabsTrigger>
                    <TabsTrigger value="conferencias">Conferência Sienge</TabsTrigger>
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
                        cteData={processedData.sheets['Notas Válidas']?.filter(n => !n.destUF) || []}
                    />
                </TabsContent>
                
                <TabsContent value="reconciliation" className="mt-6">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <GitCompareArrows className="h-8 w-8 text-primary" />
                                <div>
                                    <CardTitle className="font-headline text-2xl">Conciliação de Itens (XML vs Sienge)</CardTitle>
                                    <CardDescription>Carregue a planilha do Sienge. A comparação será executada automaticamente.</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <FileUploadForm
                                displayName="Itens do Sienge"
                                formId="sienge-for-reconciliation"
                                files={{ 'sienge-for-reconciliation': !!siengeFile }}
                                onFileChange={onSiengeFileChange}
                                onClearFile={onClearSiengeFile}
                            />
                            {(!processedData.sheets['Itens Válidos'] || processedData.sheets['Itens Válidos'].length === 0) &&
                            (!processedData.sheets['Itens Válidos Saídas'] || processedData.sheets['Itens Válidos Saídas'].length === 0) && (
                                <Alert variant="destructive">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Dados XML em falta</AlertTitle>
                                    <AlertDescription>
                                        Processe os XMLs de entrada ou saída na primeira aba para habilitar a conciliação.
                                    </AlertDescription>
                                </Alert>
                            )}
                            
                            {reconciliationResults ? (
                                <div className="mt-6">
                                    <Tabs defaultValue="reconciled">
                                        <TabsList className="grid w-full grid-cols-3">
                                            <TabsTrigger value="reconciled">Conciliados ({reconciliationResults.reconciled.length})</TabsTrigger>
                                            <TabsTrigger value="onlyInSienge">Apenas no Sienge ({reconciliationResults.onlyInSienge.length})</TabsTrigger>
                                            <TabsTrigger value="onlyInXml">Apenas no XML ({reconciliationResults.onlyInXml.length})</TabsTrigger>
                                        </TabsList>
                                        <div className="mt-4">
                                            <TabsContent value="reconciled">
                                                <Button onClick={() => handleDownloadConciliacao(reconciliationResults.reconciled, 'Itens_Conciliados')} size="sm" className="mb-4" disabled={reconciliationResults.reconciled.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                                <DataTable columns={getColumns(reconciliationResults.reconciled)} data={reconciliationResults.reconciled} />
                                            </TabsContent>
                                            <TabsContent value="onlyInSienge">
                                                <Button onClick={() => handleDownloadConciliacao(reconciliationResults.onlyInSienge, 'Itens_Apenas_Sienge')} size="sm" className="mb-4" disabled={reconciliationResults.onlyInSienge.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                                <DataTable columns={getColumns(reconciliationResults.onlyInSienge)} data={reconciliationResults.onlyInSienge} />
                                            </TabsContent>
                                            <TabsContent value="onlyInXml">
                                                <Button onClick={() => handleDownloadConciliacao(reconciliationResults.onlyInXml, 'Itens_Apenas_XML')} size="sm" className="mb-4" disabled={reconciliationResults.onlyInXml.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                                <DataTable columns={getColumns(reconciliationResults.onlyInXml)} data={reconciliationResults.onlyInXml} />
                                            </TabsContent>
                                        </div>
                                    </Tabs>
                                </div>
                            ) : (
                                siengeFile && (
                                    <div className="flex flex-col items-center justify-center min-h-[300px] text-muted-foreground border-2 border-dashed rounded-lg p-8">
                                        <Loader2 className="h-12 w-12 animate-spin text-primary" />
                                        <p className="mt-4 text-center">Processando dados para conciliação...</p>
                                    </div>
                                )
                            )}
                        </CardContent>
                    </Card>
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
                                displayName="Itens do Sienge"
                                formId="sienge-for-conference"
                                files={{ 'sienge-for-conference': !!siengeFile }}
                                onFileChange={onSiengeFileChange}
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
                            <SiengeTaxCheck siengeData={processedData.siengeSheetData}/>
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
                                    {!processedData.siengeSheetData ? (
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
                                                                Apesar de as notas de revenda terem sido identificadas no Sienge, os ficheiros XML correspondentes não foram encontrados entre os ficheiros carregados.
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
