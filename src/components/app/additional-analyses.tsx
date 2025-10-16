"use client";

import { useState, useMemo, useEffect, type ChangeEvent, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileSearch, Sheet, Archive, AlertCircle, Loader2, Download, AlertTriangle, UploadCloud, Trash2, GitCompareArrows, Building, Save, Database, FileJson, Check, XSquare } from "lucide-react";
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/app/data-table";
import { getColumns, getColumnsWithCustomRender } from "@/lib/columns-helper";
import type { ProcessedData, SpedInfo } from "@/lib/excel-processor";
import { FileUploadForm } from "@/components/app/file-upload-form";
import { cleanAndToStr } from "@/lib/utils";
import { KeyChecker } from "./key-checker";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CfopValidator, CfopValidationData } from "./cfop-validator";
import { AllClassifications } from "./imobilizado-analysis";


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
    allPersistedClassifications: AllClassifications;
    onPersistAllClassifications: (allData: AllClassifications) => void;
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
    onExportSession,
    allPersistedClassifications,
    onPersistAllClassifications,
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

    
    const { reconciliationResults, error: reconciliationError } = useReconciliation(processedData.siengeSheetData, processedData.sheets['Itens Válidos']);

    // Estado Exportação XML Revenda
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
                                <CardDescription>Execute análises de conciliação, verificação SPED e exporte relatórios.</CardDescription>
                            </div>
                        </div>
                        <Button onClick={onExportSession} size="sm" variant="outline"><FileJson className="mr-2 h-4 w-4"/>Exportar Sessão Atual</Button>
                    </div>
                </CardHeader>
             </Card>

            <Tabs defaultValue="sped" className="w-full">
                <TabsList className="grid w-full grid-cols-1 md:grid-cols-2">
                    <TabsTrigger value="sped">Verificação SPED</TabsTrigger>
                    <TabsTrigger value="reconciliation">Conciliações (XML vs Sienge)</TabsTrigger>
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
                        processedData={processedData}
                        reconciliationResults={reconciliationResults}
                        error={reconciliationError}
                        allPersistedClassifications={allPersistedClassifications}
                        onPersistAllClassifications={onPersistAllClassifications}
                        competence={competence}
                    />
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
    processedData: ProcessedData;
    onSiengeFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
    onClearSiengeFile: () => void;
    reconciliationResults: { reconciled: CfopValidationData[], onlyInSienge: any[], onlyInXml: any[] } | null;
    error: string | null;
    allPersistedClassifications: AllClassifications;
    onPersistAllClassifications: (allData: AllClassifications) => void;
    competence: string | null;
}

function useReconciliation(siengeData: any[] | null, xmlItems: any[] | null) {
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
            cfop: findHeader(siengeData, ['cfop']),
            siengeDesc: findHeader(siengeData, ['descrição', 'descrição do item', 'produto fiscal']),
            //... other headers
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

        const reconciled: CfopValidationData[] = [];
        let remainingXmlItems = [...xmlItems];
        let remainingSiengeItems = [...filteredSiengeData];

        const reconciliationPass = (
            siengeItems: any[],
            xmlItems: any[],
            getSiengeKey: (item: any) => string | null,
            getXmlKey: (item: any) => string | null = getSiengeKey
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
                        const matchedXmlItem = matchedXmlItems.shift(); 
                        if (matchedXmlItems.length === 0) xmlMap.delete(key);
                        
                        const mergedItem: CfopValidationData = {
                            ...matchedXmlItem,
                            'Sienge_CFOP': siengeItem[h.cfop as string] || 'N/A',
                            'Sienge_Descrição': siengeItem[h.siengeDesc as string] || 'N/A',
                        };

                        matchedInPass.push(mergedItem);
                        return;
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
            (item) => getComparisonKey(item['Número da Nota'], item['CPF/CNPJ do Emitente'], item['Valor Total'])
        );
        reconciled.push(...result.matched);

        return { reconciliationResults: { reconciled, onlyInSienge: result.remainingSienge, onlyInXml: result.remainingXml }, error: null };
    } catch (err: any) {
        return { reconciliationResults: null, error: err.message };
    }
}


function ReconciliationAnalysis({ siengeFile, onSiengeFileChange, onClearSiengeFile, processedData, reconciliationResults, error, allPersistedClassifications, onPersistAllClassifications, competence }: ReconciliationAnalysisProps) {
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
                <div className="flex items-center gap-3">
                    <GitCompareArrows className="h-8 w-8 text-primary" />
                    <div>
                        <CardTitle className="font-headline text-2xl">Conciliação de Itens (Entradas XML vs Sienge)</CardTitle>
                        <CardDescription>Carregue a planilha "Itens do Sienge". A comparação será executada automaticamente contra as notas de entrada.</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <FileUploadForm
                    requiredFiles={['Itens do Sienge']}
                    files={{ 'Itens do Sienge': !!siengeFile }}
                    onFileChange={onSiengeFileChange}
                    onClearFile={onClearSiengeFile}
                />
                {!processedData.sheets['Itens Válidos'] && (
                     <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Dados XML em falta</AlertTitle>
                        <AlertDescription>
                            Processe os XMLs de entrada na primeira aba para habilitar a conciliação.
                        </AlertDescription>
                    </Alert>
                )}
                
                {reconciliationResults && (
                    <div className="mt-6">
                        <Tabs defaultValue="reconciled">
                            <TabsList className="grid w-full grid-cols-4">
                                <TabsTrigger value="reconciled">Conciliados ({reconciliationResults.reconciled.length})</TabsTrigger>
                                <TabsTrigger value="validate_cfop">Validar CFOP</TabsTrigger>
                                <TabsTrigger value="onlyInSienge">Apenas no Sienge ({reconciliationResults.onlyInSienge.length})</TabsTrigger>
                                <TabsTrigger value="onlyInXml">Apenas no XML ({reconciliationResults.onlyInXml.length})</TabsTrigger>
                            </TabsList>
                            <div className="mt-4">
                                <TabsContent value="reconciled">
                                    <Button onClick={() => handleDownload(reconciliationResults.reconciled, 'Itens_Conciliados')} size="sm" className="mb-4" disabled={reconciliationResults.reconciled.length === 0}><Download className="mr-2 h-4 w-4"/> Baixar</Button>
                                    <DataTable columns={getColumns(reconciliationResults.reconciled)} data={reconciliationResults.reconciled} />
                                </TabsContent>
                                 <TabsContent value="validate_cfop">
                                     <Dialog>
                                        <DialogTrigger asChild>
                                             <Button disabled={!reconciliationResults || reconciliationResults.reconciled.length === 0}>
                                                Validar CFOP dos Itens Conciliados
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-[95vw] h-[90vh]">
                                            <DialogHeader>
                                                <DialogTitle>Validação de CFOP dos Itens Conciliados</DialogTitle>
                                                <DialogDescription>
                                                    Classifique os itens e verifique se o CFOP lançado no Sienge está correto. As classificações são guardadas automaticamente.
                                                </DialogDescription>
                                            </DialogHeader>
                                             <CfopValidator 
                                                items={reconciliationResults.reconciled}
                                                allPersistedClassifications={allPersistedClassifications}
                                                onPersistAllClassifications={onPersistAllClassifications}
                                                competence={competence}
                                            />
                                        </DialogContent>
                                    </Dialog>
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
                 {!siengeFile && processedData.sheets['Itens Válidos'] && (
                     <div className="flex flex-col items-center justify-center min-h-[300px] text-muted-foreground border-2 border-dashed rounded-lg p-8">
                        <Loader2 className="h-12 w-12 animate-spin text-primary" />
                        <p className="mt-4 text-center">Aguardando o ficheiro "Itens do Sienge" para executar a conciliação automaticamente...</p>
                    </div>
                 )}
            </CardContent>
         </Card>
    );
}
