"use client";

import { useState, useMemo, useEffect, type ChangeEvent, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileSearch, Sheet, Archive, AlertCircle, Loader2, Download, AlertTriangle, UploadCloud, Trash2, GitCompareArrows, Building, Save, Database, FileJson, MinusCircle } from "lucide-react";
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataTable } from "@/components/app/data-table";
import { getColumnsWithCustomRender } from "@/lib/columns-helper";
import { cfopDescriptions } from "@/lib/cfop";
import type { ProcessedData, SpedInfo } from "@/lib/excel-processor";
import { FileUploadForm } from "@/components/app/file-upload-form";
import { cleanAndToStr } from "@/lib/utils";
import { KeyChecker } from "./key-checker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AllClassifications } from "./imobilizado-analysis";
import { CfopValidator, CfopValidationData } from "./cfop-validator";


// ===============================================================
// Tipos
// ===============================================================
const readFileAsJson = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = event.target?.result;
                if (!data) {
                    throw new Error("Não foi possível ler o conteúdo do arquivo.");
                }
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                if (!sheetName) {
                    throw new Error("A planilha não contém nenhuma aba.");
                }
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

const normalizeKey = (key: string | undefined): string => {
    if(!key) return '';
    return key.toLowerCase().replace(/[\s-._/]/g, '');
}

// ===============================================================
// Componente Principal
// ===============================================================

interface AdditionalAnalysesProps {
    processedData: ProcessedData;
    onProcessedDataChange: (data: ProcessedData | ((prevData: ProcessedData) => ProcessedData)) => void;
    siengeFile: File | null;
    onSiengeFileChange: (file: File | null) => void;
    onSiengeDataProcessed: (data: any[] | null) => void;
    onClearSiengeFile: () => void;
    allXmlFiles: File[];
    spedFiles: File[];
    onSpedFilesChange: (files: File[]) => void;
    onSpedProcessed: (spedInfo: SpedInfo | null, keyCheckResults: any | null, spedCorrections: any | null) => void;
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
    onSiengeDataProcessed,
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
    
    // State local para Revenda
    const [resaleAnalysis, setResaleAnalysis] = useState<{ noteKeys: Set<string>; xmls: File[] } | null>(null);
    const [isAnalyzingResale, setIsAnalyzingResale] = useState(false);

    // Processamento do arquivo Sienge
    useEffect(() => {
        if (!siengeFile || processedData.siengeSheetData) return;
        
        const process = async () => {
            try {
                const data = await readFileAsJson(siengeFile);
                onSiengeDataProcessed(data);
                toast({ title: 'Planilha Sienge Processada', description: 'As análises de conciliação e revenda foram atualizadas.' });
            } catch (error: any) {
                toast({ variant: 'destructive', title: 'Erro ao Processar Sienge', description: error.message });
                onSiengeDataProcessed(null);
            }
        };
        process();
    }, [siengeFile, processedData.siengeSheetData, onSiengeDataProcessed, toast]);


    const { reconciliationResults, error: reconciliationError } = useReconciliation(processedData, processedData.siengeSheetData);

    const handleSiengeFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] || null;
        onSiengeFileChange(file);
    };
    
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
                let localSiengeData = processedData.siengeSheetData;
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
    
    }, [siengeFile, processedData.siengeSheetData, allXmlFiles, toast, onSiengeDataProcessed]);
    
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
                                <CardDescription>Execute análises de conciliação, verificação SPED e exporte relatórios.</CardDescription>
                            </div>
                        </div>
                        <Button onClick={onExportSession} size="sm" variant="outline"><FileJson className="mr-2 h-4 w-4"/>Exportar Sessão Atual</Button>
                    </div>
                </CardHeader>
             </Card>
            
             <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    <TabsTrigger value="sped">Verificação SPED</TabsTrigger>
                    <TabsTrigger value="reconciliation">Conciliação Itens (XML vs Sienge)</TabsTrigger>
                    <TabsTrigger value="resale_export">Exportação de Revenda (Sienge)</TabsTrigger>
                </TabsList>
                
                <div className="mt-6">
                    {activeTab === 'sped' && (
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
                            onSiengeFileChange={handleSiengeFileChange}
                            onClearSiengeFile={onClearSiengeFile}
                            processedData={processedData}
                            reconciliationResults={reconciliationResults}
                            error={reconciliationError}
                            allPersistedClassifications={allPersistedClassifications}
                            onPersistAllClassifications={onPersistAllClassifications}
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
                                    requiredFiles={['Itens do Sienge']}
                                    files={{ 'Itens do Sienge': !!siengeFile }}
                                    onFileChange={handleSiengeFileChange}
                                    onClearFile={onClearSiengeFile}
                                />
                                {!processedData.siengeSheetData ? (
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
// Componente de Análise de Conciliação e Hook
// ===============================================================
export type ReconciliationResults = {
    reconciled: CfopValidationData[];
    onlyInSienge: any[];
    onlyInXml: any[];
    otherSiengeItems: Record<string, any[]>;
} | null;

interface ReconciliationAnalysisProps {
    siengeFile: File | null;
    processedData: ProcessedData;
    onSiengeFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
    onClearSiengeFile: () => void;
    reconciliationResults: ReconciliationResults;
    error: string | null;
    allPersistedClassifications: AllClassifications;
    onPersistAllClassifications: (allData: AllClassifications) => void;
}

function useReconciliation(processedData: ProcessedData | null, siengeSheetData: any[] | null): { reconciliationResults: ReconciliationResults, error: string | null } {
    return useMemo(() => {
        if (!processedData) return { reconciliationResults: null, error: null };

        const { sheets } = processedData;
        const xmlItems = sheets?.['Itens Válidos'];
        const cteItems = sheets?.['CTEs Válidos'];

        const nfeHeaderMap = new Map((sheets?.['Notas Válidas'] || []).map(n => [n['Chave Unica'], n]));
        
        const allXmlItems: any[] = [];
        if (xmlItems) {
            allXmlItems.push(...xmlItems.map(item => {
                const header = nfeHeaderMap.get(item['Chave Unica']);
                return {
                    ...item,
                    Fornecedor: header?.Fornecedor || item.Fornecedor,
                    'Data de Emissão': header?.['Emissão'] || item['Emissão'],
                    documentType: 'NFE',
                };
            }));
        }
        if (cteItems) {
            allXmlItems.push(...cteItems.map(cte => ({
                ...cte, 
                'Número da Nota': cte['Número'], 
                'CPF/CNPJ do Emitente': cte['CPF/CNPJ do Fornecedor'],
                'Valor Total': cte['Valor da Prestação'], 
                'Descrição': `Frete CTe N° ${cte['Número']}`,
                CFOP: cte['CFOP'], 
                documentType: 'CTE', 
                Item: '1', 
                'Código': `CTE-${cte['Número']}`,
                'Chave Unica': cleanAndToStr(cte['Número']) + cleanAndToStr(cte['CPF/CNPJ do Fornecedor']),
            })));
        }

        if (!siengeSheetData) {
            if (allXmlItems.length > 0) {
                return { 
                    reconciliationResults: { 
                        reconciled: [], 
                        onlyInSienge: [], 
                        onlyInXml: allXmlItems,
                        otherSiengeItems: {},
                    }, 
                    error: null 
                };
            }
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

            const espHeader = findHeader(siengeSheetData, ['esp']);
            if (!espHeader) throw new Error("Não foi possível encontrar a coluna 'Esp' na planilha Sienge para filtragem.");

            const otherSiengeItems: Record<string, any[]> = {};
            const siengeItemsForReconciliation: any[] = [];
            siengeSheetData.forEach(row => {
                const espValue = row[espHeader] ? String(row[espHeader]).trim().toUpperCase() : 'SEM ESP';
                if (espValue === 'NFE' || espValue === 'NFSR') {
                    siengeItemsForReconciliation.push(row);
                } else {
                    if (!otherSiengeItems[espValue]) {
                        otherSiengeItems[espValue] = [];
                    }
                    otherSiengeItems[espValue].push(row);
                }
            });

            const h = {
                cnpj: findHeader(siengeItemsForReconciliation, ['cpf/cnpj', 'cpf/cnpj do fornecedor']),
                numero: findHeader(siengeItemsForReconciliation, ['número', 'numero', 'numero da nota', 'nota fiscal']),
                valorTotal: findHeader(siengeItemsForReconciliation, ['valor total', 'valor', 'vlr total']),
                siengeCfop: findHeader(siengeItemsForReconciliation, ['cfop']),
                siengeDesc: findHeader(siengeItemsForReconciliation, ['descrição', 'descrição do item', 'produto fiscal']),
                icmsOutras: findHeader(siengeItemsForReconciliation, ['icms outras', 'icmsoutras']),
                desconto: findHeader(siengeItemsForReconciliation, ['desconto']),
                frete: findHeader(siengeItemsForReconciliation, ['frete']),
                ipiDespesas: findHeader(siengeItemsForReconciliation, ['ipi despesas', 'ipidespesas']),
                icmsSt: findHeader(siengeItemsForReconciliation, ['icms-st', 'icms st', 'valor icms st', 'vlr icms st', 'vlr icms subst']),
                despesasAcessorias: findHeader(siengeItemsForReconciliation, ['despesas acessórias', 'despesasacessorias', 'voutro']),
                precoUnitario: findHeader(siengeItemsForReconciliation, ['preço unitário', 'preco unitario', 'valor unitario', 'vlr unitario']),
            };

            if (!h.cnpj || !h.numero || !h.valorTotal) throw new Error("Não foi possível encontrar as colunas essenciais ('Número', 'CPF/CNPJ', 'Valor Total') na planilha Sienge para notas NFE/NFSR.");

            const getComparisonKey = (numero: any, cnpj: any, valor: any): string | null => {
                const cleanNumero = cleanAndToStr(numero);
                const cleanCnpj = String(cnpj).replace(/\D/g, '');
                const cleanValor = parseFloat(String(valor || '0').replace(',', '.')).toFixed(2);
                if (!cleanNumero || !cleanCnpj || cleanValor === 'NaN') return null;
                return `${cleanNumero}-${cleanCnpj}-${cleanValor}`;
            };

            let reconciled: any[] = [];
            let remainingXmlItems = [...allXmlItems];
            let remainingSiengeItems = [...siengeItemsForReconciliation];

            const reconciliationPass = (sienge: any[], xml: any[], getSiengeKey: (item: any) => string | null, getXmlKey: (item: any) => string | null, passName: string) => {
                const matchedInPass: any[] = [];
                const unmatchedSienge: any[] = [];
                const xmlMap = new Map<string, any[]>();
                xml.forEach(item => {
                    const key = getXmlKey(item);
                    if (key) {
                        if (!xmlMap.has(key)) xmlMap.set(key, []);
                        xmlMap.get(key)!.push(item);
                    }
                });

                sienge.forEach(siengeItem => {
                    const key = getSiengeKey(siengeItem);
                    if (key && xmlMap.has(key)) {
                        const matchedXmlItems = xmlMap.get(key)!;
                        if (matchedXmlItems.length > 0) {
                            const matchedXmlItem = matchedXmlItems.shift();
                            if (matchedXmlItems.length === 0) xmlMap.delete(key);
                            
                            matchedInPass.push({
                                ...matchedXmlItem,
                                'Sienge_CFOP': siengeItem[h.siengeCfop as string] || 'N/A',
                                'Sienge_Descrição': siengeItem[h.siengeDesc as string] || 'N/A',
                                'Observações': `Conciliado via ${passName}`,
                            });
                            return;
                        }
                    }
                    unmatchedSienge.push(siengeItem);
                });
                
                const unmatchedXml = Array.from(xmlMap.values()).flat();
                return { matched: matchedInPass, remainingSienge: unmatchedSienge, remainingXml: unmatchedXml };
            };
            
            const passes = [
                {
                    name: "Valor Total",
                    siengeKeyFn: (item: any) => getComparisonKey(item[h.numero!], item[h.cnpj!], item[h.valorTotal!]),
                    xmlKeyFn: (item: any) => getComparisonKey(item['Número da Nota'], item['CPF/CNPJ do Emitente'], item['Valor Total'])
                },
                {
                    name: "Preço Unitário",
                    siengeKeyFn: (item: any) => h.precoUnitario ? getComparisonKey(item[h.numero!], item[h.cnpj!], item[h.precoUnitario!]) : null,
                    xmlKeyFn: (item: any) => getComparisonKey(item['Número da Nota'], item['CPF/CNPJ do Emitente'], item['Valor Unitário'])
                },
                 {
                    name: "Valor Total - IPI/ICMS ST",
                    siengeKeyFn: (item: any) => (h.ipiDespesas || h.icmsSt) ? getComparisonKey(item[h.numero!], item[h.cnpj!], parseFloat(String(item[h.valorTotal!] || '0').replace(',', '.')) - (h.ipiDespesas ? parseFloat(String(item[h.ipiDespesas] || '0').replace(',', '.')) : 0) - (h.icmsSt ? parseFloat(String(item[h.icmsSt] || '0').replace(',', '.')) : 0)) : null,
                    xmlKeyFn: (item: any) => getComparisonKey(item['Número da Nota'], item['CPF/CNPJ do Emitente'], item['Valor Total'])
                }
            ];

            for (const pass of passes) {
                if (remainingSiengeItems.length === 0 || remainingXmlItems.length === 0) break;
                const result = reconciliationPass(remainingSiengeItems, remainingXmlItems, pass.siengeKeyFn, pass.xmlKeyFn, pass.name);
                if (result.matched.length > 0) {
                    reconciled.push(...result.matched);
                }
                remainingSiengeItems = result.remainingSienge;
                remainingXmlItems = result.remainingXml;
            }

            return { 
                reconciliationResults: { 
                    reconciled, 
                    onlyInSienge: remainingSiengeItems, 
                    onlyInXml: remainingXmlItems, 
                    otherSiengeItems 
                }, 
                error: null 
            };

        } catch (err: any) {
            console.error("Reconciliation Error:", err);
            return { reconciliationResults: null, error: err.message };
        }
    }, [processedData, siengeSheetData]);
}


function ReconciliationAnalysis({ siengeFile, onSiengeFileChange, onClearSiengeFile, reconciliationResults, error, allPersistedClassifications, onPersistAllClassifications }: ReconciliationAnalysisProps) {
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
            if (firstTab) {
                setActiveOtherTab(firstTab);
            }
        }
    }, [reconciliationResults?.otherSiengeItems]);


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
                            <CardTitle className="font-headline text-2xl">Conciliação de Itens (Entradas XML vs Sienge)</CardTitle>
                            <CardDescription>Carregue a planilha "Itens do Sienge". A comparação será executada automaticamente contra as notas de entrada.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <FileUploadForm
                        requiredFiles={['Itens do Sienge']}
                        files={{ 'Itens do Sienge': !!siengeFile }}
                        onFileChange={onSiengeFileChange}
                        onClearFile={onClearSiengeFile}
                    />
                </CardContent>
            </Card>
            
            {reconciliationResults && (
                <div className="mt-6 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Resultados da Conciliação</CardTitle>
                        </CardHeader>
                        <CardContent>
                             <Tabs value={activeTab} onValueChange={setActiveTab}>
                                <TabsList className="grid w-full grid-cols-1 md:grid-cols-3">
                                    <TabsTrigger value="reconciled">Conciliados ({reconciliationResults.reconciled.length})</TabsTrigger>
                                    <TabsTrigger value="onlyInSienge">Apenas no Sienge ({reconciliationResults.onlyInSienge.length})</TabsTrigger>
                                    <TabsTrigger value="onlyInXml">Apenas no XML ({reconciliationResults.onlyInXml.length})</TabsTrigger>
                                </TabsList>
                                <div className="mt-4">
                                     {activeTab === 'reconciled' && (
                                        <CfopValidator 
                                            items={reconciliationResults.reconciled}
                                            allPersistedClassifications={allPersistedClassifications}
                                            onPersistAllClassifications={onPersistAllClassifications}
                                        />
                                    )}
                                     {activeTab === 'onlyInSienge' && (
                                         <div>
                                            <Button onClick={() => handleDownload(reconciliationResults.onlyInSienge, 'Itens_Apenas_Sienge')} size="sm" className="mb-4" disabled={reconciliationResults.onlyInSienge.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                            <DataTable columns={getColumnsWithCustomRender(reconciliationResults.onlyInSienge, Object.keys(reconciliationResults.onlyInSienge[0] || {}))} data={reconciliationResults.onlyInSienge} />
                                         </div>
                                    )}
                                     {activeTab === 'onlyInXml' && (
                                         <div>
                                            <Button onClick={() => handleDownload(reconciliationResults.onlyInXml, 'Itens_Apenas_XML')} size="sm" className="mb-4" disabled={reconciliationResults.onlyInXml.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                            <DataTable columns={getColumnsWithCustomRender(reconciliationResults.onlyInXml, Object.keys(reconciliationResults.onlyInXml[0] || {}))} data={reconciliationResults.onlyInXml} />
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
            )}

            {error && (
                <Alert variant="destructive" className="mt-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Erro na Análise de Conciliação</AlertTitle>
                    <AlertDescription>
                        {error}
                    </AlertDescription>
                </Alert>
            )}

            {!siengeFile && (
                <div className="flex flex-col items-center justify-center min-h-[300px] text-muted-foreground border-2 border-dashed rounded-lg p-8 mt-6">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <p className="mt-4 text-center">Aguardando o ficheiro "Itens do Sienge" para executar a conciliação automaticamente...</p>
                </div>
            )}
        </div>
    );
}

    
