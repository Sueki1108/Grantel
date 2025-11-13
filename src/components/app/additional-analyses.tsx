"use client";

import { useState, useMemo, useEffect, type ChangeEvent, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileSearch, Sheet, Archive, AlertCircle, Loader2, Download, AlertTriangle, UploadCloud, Trash2, GitCompareArrows, Building, Save, Database, FileJson, MinusCircle, TicketPercent, CheckSquare, RotateCw } from "lucide-react";
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/components/app/columns-helper";
import { cfopDescriptions } from "@/lib/cfop";
import type { ProcessedData, SpedInfo, SpedCorrectionResult } from "@/lib/excel-processor";
import { FileUploadForm } from "@/components/app/file-upload-form";
import { cleanAndToStr } from "@/lib/utils";
import { KeyChecker, KeyCheckResult } from "./key-checker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AllClassifications } from "./imobilizado-analysis";
import { CfopValidator } from "./cfop-validator";


// ===============================================================
// Tipos
// ===============================================================
export type ReconciliationResults = {
    reconciled: any[];
    onlyInSienge: any[];
    onlyInXml: any[];
    otherSiengeItems: Record<string, any[]>;
} | null;


// ===============================================================
// Constantes e Helpers
// ===============================================================

const normalizeKey = (key: string | undefined): string => {
    if(!key) return '';
    return key.toLowerCase().replace(/[\s-._/]/g, '');
}


// ===============================================================
// Componente Principal
// ===============================================================

interface AdditionalAnalysesProps {
    processedData: ProcessedData;
    onProcessedDataChange: (fn: (prevData: ProcessedData | null) => ProcessedData | null) => void;
    siengeFile: File | null;
    onSiengeFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
    onClearSiengeFile: () => void;
    allXmlFiles: File[];
    spedFiles: File[];
    onSpedFilesChange: (files: File[]) => void;
    onSpedProcessed: (spedInfo: SpedInfo | null, keyCheckResults: any | null, spedCorrections: SpedCorrectionResult | null) => void;
    competence: string | null;
    onExportSession: () => void;
    allPersistedClassifications: AllClassifications;
    onPersistAllClassifications: (allData: AllClassifications) => void;
}

export function AdditionalAnalyses({ 
    processedData, 
    onProcessedDataChange,
    siengeFile, 
    onSiengeFileChange,
    onClearSiengeFile,
    allXmlFiles,
    spedFiles,
    onSpedFilesChange,
    onSpedProcessed,
    competence,
    onExportSession,
    allPersistedClassifications,
    onPersistAllClassifications,
}: AdditionalAnalysesProps) {
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState("sped");
    const [isExporting, setIsExporting] = useState(false);
    const [resaleAnalysis, setResaleAnalysis] = useState<{ noteKeys: Set<string>; xmls: File[] } | null>(null);
    const [isAnalyzingResale, setIsAnalyzingResale] = useState(false);
    const [disregardedDifalItems, setDisregardedDifalItems] = useState<Set<string>>(new Set());

    const { reconciliationResults, error: reconciliationError } = useMemo(() => {
        if (!processedData || !processedData.sheets) {
            return { reconciliationResults: null, error: null };
        }
    
        const { sheets, siengeSheetData } = processedData;
        
        // 1. Unificar todos os itens de XML (Entradas, Saídas, CTEs)
         const allXmlItems = [
            ...(sheets?.['Itens Válidos'] || []),
            ...(sheets?.['Itens Válidos Saídas'] || []),
            ...(sheets?.['CTEs Válidos'] || []).map(cte => ({
                ...cte,
                'Número da Nota': cte['Número'],
                'CPF/CNPJ do Emitente': cte['CPF/CNPJ do Fornecedor'],
                'Valor Total': cte['Valor da Prestação'],
                'Descrição': `Frete CTe N° ${cte['Número']}`,
                documentType: 'CTE',
                Item: '1',
                'Código': `CTE-${cte['Número']}`,
                'Chave Unica': cleanAndToStr(cte['Número']) + cleanAndToStr(cte['CPF/CNPJ do Fornecedor']),
            }))
        ];
    
        // 2. Se não houver dados do Sienge, retorna todos os itens do XML para validação.
        if (!siengeSheetData) {
            const enrichedData = allXmlItems.map(item => ({
                ...item,
                'Sienge_CFOP': 'N/A',
                'Observações': 'Sienge não carregado'
            }));

            return { 
                reconciliationResults: { reconciled: enrichedData, onlyInSienge: [], onlyInXml: [], otherSiengeItems: {} }, 
                error: null 
            };
        }
    
        // 3. Processar dados do Sienge se existirem
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
    
            const espHeader = findHeader(siengeSheetData, ['esp']);
            if (!espHeader) throw new Error("Não foi possível encontrar a coluna 'Esp' na planilha Sienge para filtragem.");
    
            const otherSiengeItems: Record<string, any[]> = {};
            const siengeItemsForReconciliation: any[] = [];
            siengeSheetData.forEach(row => {
                const espValue = row[espHeader] ? String(row[espHeader]).trim().toUpperCase() : 'SEM ESP';
                if (espValue === 'NFE' || espValue === 'NFSR') {
                    siengeItemsForReconciliation.push(row);
                } else {
                    if (!otherSiengeItems[espValue]) otherSiengeItems[espValue] = [];
                    otherSiengeItems[espValue].push(row);
                }
            });
    
            const h = {
                cnpj: findHeader(siengeItemsForReconciliation, ['cpf/cnpj', 'cpf/cnpj do fornecedor', 'cpf/cnpj do destinatário']),
                numero: findHeader(siengeItemsForReconciliation, ['número', 'numero', 'numero da nota', 'nota fiscal']),
                siengeCfop: findHeader(siengeItemsForReconciliation, ['cfop']),
            };
    
            if (!h.cnpj || !h.numero || !h.siengeCfop) throw new Error("Não foi possível encontrar as colunas essenciais ('Número', 'CPF/CNPJ', 'CFOP') na planilha Sienge para notas NFE/NFSR.");
            
            const siengeMap = new Map<string, string>();
            siengeItemsForReconciliation.forEach(item => {
                 const partnerCnpj = item[h.cnpj!];
                 const key = `${cleanAndToStr(item[h.numero!])}-${cleanAndToStr(partnerCnpj)}`;
                 if(!siengeMap.has(key)) {
                    siengeMap.set(key, item[h.siengeCfop!]);
                 }
            });

            // 4. Enriquecer os dados do XML com o CFOP do Sienge, se encontrado
            const reconciledData = allXmlItems.map(item => {
                const partnerCnpj = item['CPF/CNPJ do Destinatário'] || item['CPF/CNPJ do Emitente'];
                const key = `${cleanAndToStr(item['Número da Nota'] || item['Número'] || '')}-${cleanAndToStr(partnerCnpj)}`;
                const siengeCfop = siengeMap.get(key);
                return {
                    ...item,
                    'Sienge_CFOP': siengeCfop || 'N/A',
                    'Observações': siengeCfop ? 'Conciliado' : 'Apenas no XML'
                }
            });
            
            return { 
                reconciliationResults: { reconciled: reconciledData, onlyInSienge: [], onlyInXml: [], otherSiengeItems }, 
                error: null 
            };
    
        } catch (err: any) {
            console.error("Reconciliation Error:", err);
            return { reconciliationResults: null, error: err.message };
        }
    }, [processedData?.siengeSheetData, processedData?.sheets]);

    const difalItems = useMemo(() => {
        if (!reconciliationResults?.reconciled || !competence || !allPersistedClassifications[competence]) return [];

        const cfopValidations = allPersistedClassifications[competence]?.cfopValidations?.classifications || {};
        return reconciliationResults.reconciled.filter(item => {
            const uniqueProductKey = `${(item['CPF/CNPJ do Emitente'] || '').replace(/\D/g, '')}-${(item['Código'] || '')}-${item.Sienge_CFOP || ''}`;
            return cfopValidations[uniqueProductKey]?.isDifal;
        });
    }, [reconciliationResults, competence, allPersistedClassifications]);

    const handleToggleDifalDisregard = (itemKey: string) => {
        setDisregardedDifalItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(itemKey)) {
                newSet.delete(itemKey);
                toast({ title: "Item Revertido", description: "O item foi movido de volta para a lista de sujeitos ao DIFAL." });
            } else {
                newSet.add(itemKey);
                toast({ title: "Item Desconsiderado", description: "O item foi movido para a lista de desconsiderados." });
            }
            return newSet;
        });
    };
    

    const handleAnalyzeResale = () => {
        if (!processedData?.siengeSheetData) {
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
                const localSiengeData = processedData.siengeSheetData!;
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
    };


    const handleExportResaleXmls = async () => {
        if (!resaleAnalysis || resaleAnalysis.xmls.length === 0) {
            toast({ title: "Nenhum XML de revenda encontrado para exportar" });
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
            
            setTimeout(() => {
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
            }, 100);
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
                                <CardDescription>Execute análises de conciliação, verificação SPED e exporte relatórios.</CardDescription>
                            </div>
                        </div>
                        <Button onClick={onExportSession} size="sm" variant="outline"><FileJson className="mr-2 h-4 w-4"/>Exportar Sessão Atual</Button>
                    </div>
                </CardHeader>
             </Card>
            
             <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-1 md:grid-cols-5">
                    <TabsTrigger value="sped">Verificação SPED</TabsTrigger>
                    <TabsTrigger value="reconciliation">Conciliação (XML x Sienge)</TabsTrigger>
                    <TabsTrigger value="cfop_validation">Validação CFOP</TabsTrigger>
                    <TabsTrigger value="difal">Análise DIFAL</TabsTrigger>
                    <TabsTrigger value="resale_export">Exportação de Revenda</TabsTrigger>
                </TabsList>
                
                <div className="mt-6">
                    {activeTab === 'sped' && processedData && (
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
                    )}
                    
                    {activeTab === 'reconciliation' && (
                        <ReconciliationAnalysis 
                            siengeFile={siengeFile}
                            onSiengeFileChange={onSiengeFileChange}
                            onClearSiengeFile={onClearSiengeFile}
                            reconciliationResults={reconciliationResults}
                            error={reconciliationError}
                        />
                    )}
                    
                     {activeTab === 'cfop_validation' && (
                        <CfopValidator 
                            reconciledData={reconciliationResults?.reconciled || []}
                            allPersistedClassifications={allPersistedClassifications}
                            onPersistAllClassifications={onPersistAllClassifications}
                            competence={competence}
                        />
                     )}

                     {activeTab === 'difal' && (
                        <DifalItemsAnalysis
                            items={difalItems}
                            disregardedItems={disregardedDifalItems}
                            onToggleDisregard={handleToggleDifalDisregard}
                        />
                     )}

                    {activeTab === 'resale_export' && (
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
                                <FileUploadForm
                                    displayName="Itens do Sienge"
                                    formId="sienge-for-resale"
                                    files={{ 'sienge-for-resale': !!siengeFile }}
                                    onFileChange={onSiengeFileChange}
                                    onClearFile={onClearSiengeFile}
                                />
                                {!processedData?.siengeSheetData ? (
                                    <div className="p-8 text-center text-muted-foreground mt-4">
                                        <AlertTriangle className="mx-auto h-12 w-12 mb-4" />
                                        <h3 className="text-xl font-semibold mb-2">Aguardando dados Sienge</h3>
                                        <p>Carregue a planilha "Itens do Sienge" para identificar as notas de revenda.</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-start gap-4 mt-6">
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
                    )}
                </div>
            </Tabs>
        </div>
    );
}

// ===============================================================
// Componente de Análise de Conciliação
// ===============================================================

interface ReconciliationAnalysisProps {
    siengeFile: File | null;
    reconciliationResults: ReconciliationResults;
    error: string | null;
    onSiengeFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
    onClearSiengeFile: () => void;
}


function ReconciliationAnalysis({ siengeFile, onSiengeFileChange, onClearSiengeFile, reconciliationResults, error }: ReconciliationAnalysisProps) {
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState("reconciled");
    const [activeOtherTab, setActiveOtherTab] = useState<string>('');
    
    useEffect(() => {
        if (error) {
            toast({ variant: 'destructive', title: "Erro na Conciliação", description: error });
        }
    }, [error, toast]);
    
     useEffect(() => {
        if (reconciliationResults?.otherSiengeItems) {
            const firstTab = Object.keys(reconciliationResults.otherSiengeItems)[0];
            if (firstTab && !activeOtherTab) {
                setActiveOtherTab(firstTab);
            }
        }
    }, [reconciliationResults?.otherSiengeItems, activeOtherTab]);

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
        <div className="space-y-6">
             <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <GitCompareArrows className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="font-headline text-2xl">Conciliação de Itens (XML vs Sienge)</CardTitle>
                            <CardDescription>Carregue a planilha "Itens do Sienge". A comparação com as entradas de XML será executada automaticamente.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <FileUploadForm
                        displayName="Itens do Sienge"
                        formId="sienge-for-reconciliation"
                        files={{ 'sienge-for-reconciliation': !!siengeFile }}
                        onFileChange={onSiengeFileChange}
                        onClearFile={onClearSiengeFile}
                    />
                </CardContent>
            </Card>
            
            {reconciliationResults ? (
                <div className="mt-6 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Resultados da Conciliação (NF-e/NFS-r)</CardTitle>
                        </CardHeader>
                        <CardContent>
                             <Tabs value={activeTab} onValueChange={setActiveTab}>
                                <TabsList className="grid w-full grid-cols-1 md:grid-cols-2">
                                    <TabsTrigger value="reconciled">Itens para Validação ({reconciliationResults.reconciled.length})</TabsTrigger>
                                    <TabsTrigger value="onlyInSienge">Apenas no Sienge ({reconciliationResults.onlyInSienge.length})</TabsTrigger>
                                </TabsList>
                                <div className="mt-4">
                                     {activeTab === 'reconciled' && (
                                        <div>
                                            <Button onClick={() => handleDownload(reconciliationResults.reconciled, 'Itens_Conciliados')} size="sm" className="mb-4" disabled={reconciliationResults.reconciled.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                            <DataTable columns={getColumnsWithCustomRender(reconciliationResults.reconciled, Object.keys(reconciliationResults.reconciled[0] || {}))} data={reconciliationResults.reconciled} />
                                        </div>
                                    )}
                                     {activeTab === 'onlyInSienge' && (
                                         <div>
                                            <Button onClick={() => handleDownload(reconciliationResults.onlyInSienge, 'Itens_Apenas_Sienge')} size="sm" className="mb-4" disabled={reconciliationResults.onlyInSienge.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                            <DataTable columns={getColumnsWithCustomRender(reconciliationResults.onlyInSienge, Object.keys(reconciliationResults.onlyInSienge[0] || {}))} data={reconciliationResults.onlyInSienge} />
                                         </div>
                                    )}
                                </div>
                            </Tabs>
                        </CardContent>
                    </Card>

                     {Object.keys(reconciliationResults.otherSiengeItems).length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Outros Lançamentos do Sienge</CardTitle>
                                <CardDescription>Linhas da planilha Sienge que não são NF-e ou NFS-r, agrupadas pela coluna "Esp".</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Tabs value={activeOtherTab} onValueChange={setActiveOtherTab} className="w-full">
                                    <TabsList className="h-auto flex-wrap justify-start">
                                        {Object.entries(reconciliationResults.otherSiengeItems).map(([esp, items]) => (
                                            <TabsTrigger key={esp} value={esp}>
                                                {esp} ({items.length})
                                            </TabsTrigger>
                                        ))}
                                    </TabsList>
                                    {Object.entries(reconciliationResults.otherSiengeItems).map(([esp, items]) => (
                                        <TabsContent key={esp} value={esp} className="mt-4">
                                            <Button onClick={() => handleDownload(items, `Sienge_Outros_${esp}`)} size="sm" className="mb-4" disabled={items.length === 0}>
                                                <Download className="mr-2 h-4 w-4" /> Baixar
                                            </Button>
                                            <DataTable columns={getColumnsWithCustomRender(items, Object.keys(items[0] || {}))} data={items} />
                                        </TabsContent>
                                    ))}
                                </Tabs>
                            </CardContent>
                        </Card>
                    )}
                </div>
            ) : error ? (
                <Alert variant="destructive" className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Erro na Análise de Conciliação</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            ) : !siengeFile ? (
                 <div className="flex flex-col items-center justify-center min-h-[300px] text-muted-foreground border-2 border-dashed rounded-lg p-8 mt-6">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <p className="mt-4 text-center">Aguardando o ficheiro "Itens do Sienge" para executar a conciliação automaticamente...</p>
                </div>
            ) : null}
        </div>
    );
}


function DifalItemsAnalysis({ items, disregardedItems, onToggleDisregard }: { items: any[], disregardedItems: Set<string>, onToggleDisregard: (itemKey: string) => void }) {
    const sujeitos = items.filter(item => !disregardedItems.has(item.id));
    const desconsiderados = items.filter(item => disregardedItems.has(item.id));
    
    const columns = getColumnsWithCustomRender(items, ['Fornecedor', 'Número da Nota', 'Descrição', 'Valor Total', 'CFOP', 'Sienge_CFOP']);

    return (
         <Card>
            <CardHeader>
                <CardTitle className="font-headline text-2xl">Análise de Itens Marcados para DIFAL</CardTitle>
                <CardDescription>
                    Revise os itens marcados para DIFAL na etapa de validação de CFOP. Mova itens para a lista de desconsiderados se não forem aplicáveis.
                </CardDescription>
            </CardHeader>
            <CardContent>
                 <Tabs defaultValue="sujeitos" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="sujeitos">Sujeitos ao DIFAL ({sujeitos.length})</TabsTrigger>
                        <TabsTrigger value="desconsiderados">Desconsiderados ({desconsiderados.length})</TabsTrigger>
                    </TabsList>
                    <TabsContent value="sujeitos" className="mt-4">
                         <DataTable
                            columns={[...columns, { id: 'action', cell: ({row}) => <Button variant="secondary" size="sm" onClick={() => onToggleDisregard(row.original.id)}><MinusCircle className="mr-2 h-4 w-4"/>Desconsiderar</Button> }]}
                            data={sujeitos}
                        />
                    </TabsContent>
                     <TabsContent value="desconsiderados" className="mt-4">
                        <DataTable
                            columns={[...columns, { id: 'action', cell: ({row}) => <Button variant="outline" size="sm" onClick={() => onToggleDisregard(row.original.id)}><RotateCw className="mr-2 h-4 w-4"/>Reverter</Button> }]}
                            data={desconsiderados}
                        />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
