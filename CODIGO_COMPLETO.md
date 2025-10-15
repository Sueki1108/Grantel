# Código Completo do Projeto

Este documento contém o código-fonte completo de todos os ficheiros relevantes para as funcionalidades da aplicação.

## Estrutura de Ficheiros

-   `src/app/automator/page.tsx`: Ficheiro principal que renderiza o cliente.
-   `src/app/automator/page-client.tsx`: O coração da aplicação, contendo toda a lógica de estado, manipulação de ficheiros e orquestração das análises.
-   `src/lib/xml-processor.ts`: Funções responsáveis por ler, interpretar e extrair dados dos ficheiros XML (NF-e, CT-e, Eventos).
-   `src/lib/excel-processor.ts`: Contém a lógica principal de negócio para filtrar, validar e processar os dados após a extração.
-   `src/lib/columns-helper.tsx`: Função auxiliar para gerar as colunas das tabelas de dados.
-   `src/lib/utils.ts`: Funções utilitárias usadas em toda a aplicação.
-   `src/lib/cfop.ts`: Dicionário com as descrições dos códigos CFOP.
-   `src/components/app/additional-analyses.tsx`: Componente que gere as abas "Imobilizado" e "Análises Finais" (Verificação SPED, Conciliação, etc.).
-   `src/components/app/saidas-analysis.tsx`: Componente para a análise de sequência das notas fiscais de saída.
-   `src/components/app/nfse-analysis.tsx`: Componente para a análise específica das notas fiscais de serviço (NFS-e).
-   `src/components/app/key-checker.tsx`: Sub-componente para a funcionalidade de verificação do SPED.
-   `src/components/app/file-upload-form.tsx`: Componente reutilizável para o carregamento de ficheiros.
-   `src/components/app/results-display.tsx`: Componente para exibir os resultados processados em abas.
-   `src/components/app/data-table.tsx`: Componente reutilizável para exibir dados tabulares com filtros e ordenação.

---

## `src/app/automator/page.tsx`

```tsx
import { AutomatorClientPage } from './page-client';

export default function AutomatorPage() {
  return <AutomatorClientPage />;
}
```

---

## `src/app/automator/page-client.tsx`

```tsx
"use client";

import { useState, useEffect, useCallback, type ChangeEvent, useMemo } from "react";
import { Sheet, UploadCloud, Cpu, BrainCircuit, Home, Trash2, AlertCircle, Terminal, Copy, Save, Loader2, KeyRound, FileSearch, CheckCircle, AlertTriangle, FileUp, Calendar as CalendarIcon, Filter, TrendingUp, BookCopy, FilePieChart, Settings, Building, Database } from "lucide-react";
import JSZip from "jszip";
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { v4 as uuidv4 } from 'uuid';

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUploadForm } from "@/components/app/file-upload-form";
import { ResultsDisplay } from "@/components/app/results-display";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Link from "next/link";
import * as XLSX from 'xlsx';
import { LogDisplay } from "@/components/app/log-display";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { processDataFrames, type ProcessedData, type SpedInfo } from "@/lib/excel-processor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdditionalAnalyses } from "@/components/app/additional-analyses";
import { processNfseForPeriodDetection, processUploadedXmls } from "@/lib/xml-processor";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SaidasAnalysis } from "@/components/app/saidas-analysis";
import { NfseAnalysis } from "@/components/app/nfse-analysis";
import { KeyCheckResult } from "@/components/app/key-checker";
import { SettingsDialog } from "@/components/app/settings-dialog";
import { cn } from "@/lib/utils";



// This should be defined outside the component to avoid re-declaration
const fileMapping: { [key: string]: string } = {
    'NFE': 'NFE', 'CTE': 'CTE', 'Itens': 'Itens', 'Saídas': 'Saídas', 'Itens Saídas': 'Itens Saídas',
    'NFE Operação Não Realizada': 'NFE Operação Não Realizada',
    'NFE Operação Desconhecida': 'NFE Operação Desconhecida',
    'CTE Desacordo de Serviço': 'CTE Desacordo de Serviço',
    'Itens do Sienge': 'Itens do Sienge',
};

const requiredFiles = [
    'NFE Operação Não Realizada', 'NFE Operação Desconhecida', 'CTE Desacordo de Serviço'
];

export function AutomatorClientPage() {
    const [files, setFiles] = useState<Record<string, any[]>>({});
    const [xmlFiles, setXmlFiles] = useState<{ nfeEntrada: File[], cte: File[], nfeSaida: File[], nfse: File[] }>({ nfeEntrada: [], cte: [], nfeSaida: [], nfse: [] });
    const [fileStatus, setFileStatus] = useState<Record<string, boolean>>({});
    const [processing, setProcessing] = useState(false);
    const [processedData, setProcessedData] = useState<ProcessedData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    
    // State for files uploaded in child components
    const [spedFiles, setSpedFiles] = useState<File[]>([]);
    const [siengeFile, setSiengeFile] = useState<File | null>(null);
    const [lastSaidaNumber, setLastSaidaNumber] = useState<number>(0);
    const [disregardedNfseNotes, setDisregardedNfseNotes] = useState<Set<string>>(new Set());


    const { toast } = useToast();

    // State for period selection modal
    const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);
    const [availablePeriods, setAvailablePeriods] = useState<string[]>([]);
    const [selectedPeriods, setSelectedPeriods] = useState<Record<string, boolean>>({});
    const [isPreProcessing, setIsPreProcessing] = useState(false);
    
    // UI Settings state
    const [isWideMode, setIsWideMode] = useState(false);
    
    // =================================================================
    // UI SETTINGS
    // =================================================================
    useEffect(() => {
        // Load UI settings from localStorage on initial load
        const wideMode = localStorage.getItem('ui-widemode') === 'true';
        setIsWideMode(wideMode);
    }, []);

    const handleSettingsChange = ({ wideMode }: { wideMode: boolean }) => {
        setIsWideMode(wideMode);
        localStorage.setItem('ui-widemode', String(wideMode));
        toast({
            title: "Configurações salvas",
            description: `O modo amplo foi ${wideMode ? 'ativado' : 'desativado'}.`,
        });
    };

    // Memoize selectedPeriods to get a stable competence string
    const competence = useMemo(() => {
        const activePeriods = Object.keys(selectedPeriods).filter(p => selectedPeriods[p]);
        if (activePeriods.length > 0) {
            // Sort and join to create a consistent ID, e.g., "2023-01_2023-02"
            return activePeriods.sort().join('_');
        }
        return null;
    }, [selectedPeriods]);


    const handleLastSaidaNumberChange = useCallback((newNumber: number) => {
        setLastSaidaNumber(newNumber);
    }, []);


    // =================================================================
    // FILE HANDLING & DOWNLOAD
    // =================================================================
    const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        const fileName = e.target.name;
        if (!selectedFile) return;

        setProcessing(true);
        setError(null);
        
        try {
            const fileProcessor = async (file: File) => {
                 const fileData = await new Promise<ArrayBuffer>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (event) => resolve(event.target?.result as ArrayBuffer);
                    reader.onerror = (error) => reject(error);
                    reader.readAsArrayBuffer(file);
                });
                const workbook = XLSX.read(fileData, { type: 'buffer' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                return XLSX.utils.sheet_to_json(worksheet, { cellDates: true, defval: null });
            }

            const jsonData = await fileProcessor(selectedFile);
            
            setFiles(prev => ({ ...prev, [fileName]: jsonData }));
            setFileStatus(prev => ({ ...prev, [fileName]: true }));
            
            toast({ title: "Planilha Carregada", description: `Dados de "${fileName}" prontos para processamento.` });
        } catch (err: any) {
            const errorMessage = `Erro ao processar a planilha "${fileName}": ${err.message}`;
            setError(errorMessage);
            setLogs(prev => [...prev, errorMessage]);
            toast({ variant: "destructive", title: `Erro ao processar "${fileName}"`, description: err.message });
        } finally {
            setProcessing(false);
        }
    };
    
    const handleXmlFileChange = async (e: ChangeEvent<HTMLInputElement>, category: 'nfeEntrada' | 'cte' | 'nfeSaida' | 'nfse') => {
        const selectedFiles = e.target.files;
        if (!selectedFiles) return;
    
        const newFiles: File[] = [];
        let extractedCount = 0;
    
        for (const file of Array.from(selectedFiles)) {
            if (file.type === 'application/zip' || file.name.toLowerCase().endsWith('.zip')) {
                try {
                    const zip = await JSZip.loadAsync(file);
                    const xmlFilePromises: Promise<File>[] = [];
                    zip.forEach((relativePath, zipEntry) => {
                        if (!zipEntry.dir && relativePath.toLowerCase().endsWith('.xml')) {
                            const promise = zipEntry.async('string').then(content => {
                                return new File([content], zipEntry.name, { type: 'application/xml' });
                            });
                            xmlFilePromises.push(promise);
                        }
                    });
                    const extractedFiles = await Promise.all(xmlFilePromises);
                    newFiles.push(...extractedFiles);
                    extractedCount += extractedFiles.length;
                } catch (error) {
                    toast({
                        variant: "destructive",
                        title: `Erro ao descompactar ${file.name}`,
                        description: "O ficheiro .zip pode estar corrompido ou num formato não suportado.",
                    });
                }
            } else if (file.type === 'text/xml' || file.name.toLowerCase().endsWith('.xml')) {
                newFiles.push(file);
            }
        }
        
        const totalNewFiles = newFiles.length;
        setXmlFiles(prev => ({ ...prev, [category]: [...prev[category], ...newFiles] }));
    
        let toastMessage: string;
        if (extractedCount > 0) {
            toastMessage = `${extractedCount} arquivos XML extraídos de .zip e adicionados.`;
        } else {
            toastMessage = `${totalNewFiles} arquivo(s) XML de ${category} adicionado(s).`;
        }
    
        toast({
            title: "Ficheiros Adicionados",
            description: toastMessage + " Os arquivos foram adicionados à lista existente. Clique em 'Validar Dados' para processá-los.",
        });
    };

    const handleClearFile = (fileName: string, category?: 'nfeEntrada' | 'cte' | 'nfeSaida' | 'nfse') => {
        if (category) {
            setXmlFiles(prev => ({ ...prev, [category]: [] }));
        } else {
            setFiles(prev => { const newFiles = { ...prev }; delete newFiles[fileName]; return newFiles; });
            setFileStatus(prev => { const newStatus = { ...prev }; delete newStatus[fileName]; return newStatus; });
            const input = document.querySelector(`input[name="${fileName}"]`) as HTMLInputElement;
            if (input) input.value = "";
        }
        
        // Don't clear all processed data, just clear what's related if needed
        toast({ title: "Arquivos Removidos", description: `Dados de "${category || fileName}" foram removidos. Processe novamente para atualizar os resultados.` });
    };

    const handleClearAllData = () => {
        setFiles({});
        setFileStatus({});
        setXmlFiles({ nfeEntrada: [], cte: [], nfeSaida: [], nfse: [] });
        setProcessedData(null);
        setError(null);
        setLogs([]);
        setSpedFiles([]);
        setSiengeFile(null);
        setProcessing(false);
        setLastSaidaNumber(0);
        setDisregardedNfseNotes(new Set());
        setSelectedPeriods({});

        const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
        inputs.forEach(input => input.value = "");

        toast({ title: "Dados limpos", description: "Todos os arquivos e resultados foram removidos." });
    };

     const handleDownloadExcel = () => {
        if (!processedData?.sheets) {
            toast({ variant: "destructive", title: "Nenhum dado para baixar", description: "Processe os arquivos primeiro." });
            return;
        }

        const workbook = XLSX.utils.book_new();
        const displayOrder = [
            "Notas Válidas", "Itens Válidos", "Chaves Válidas", "Saídas", "Itens Válidos Saídas",
            "Imobilizados",
            "Emissão Própria", "Notas Canceladas",
            ...Object.keys(processedData.sheets).filter(name => name.startsWith("Original - "))
        ];

        const sheetNameMap: { [key: string]: string } = {
            "Notas Válidas": "Notas Validas", "Itens Válidos": "Itens Validos",
            "Chaves Válidas": "Chaves Validas",
            "Notas Canceladas": "Notas Canceladas", "Emissão Própria": "Emissao Propria",
            "NFE Operação Não Realizada": "NFE Op Nao Realizada",
            "NFE Operação Desconhecida": "NFE Op Desconhecida",
            "CTE Desacordo de Serviço": "CTE Desacordo Servico",
            "Saídas": "Saidas",
            "Itens Válidos Saídas": "Itens Validos Saidas",
            "Imobilizados": "Imobilizados",
            "Original - NFE": "Entradas",
            "Original - Saídas": "Saidas Originais",
            "Original - CTE": "CTE",
            "Original - Itens": "Itens Entradas",
            "Original - Itens Saídas": "Itens Saídas Originais",
        };

        displayOrder.forEach(sheetName => {
            const sheetData = processedData.sheets[sheetName];
            if (sheetData && sheetData.length > 0) {
                const worksheet = XLSX.utils.json_to_sheet(sheetData);
                worksheet['!cols'] = Object.keys(sheetData[0] || {}).map(() => ({ wch: 20 }));
                let excelSheetName = sheetNameMap[sheetName] || sheetName;
                if (workbook.SheetNames.includes(excelSheetName)) {
                    excelSheetName = `${excelSheetName}_${Math.floor(Math.random() * 1000)}`;
                }
                XLSX.utils.book_append_sheet(workbook, worksheet, excelSheetName.substring(0, 31));
            }
        });

        const fileName = `Grantel - Validação de Documentos.xlsx`;
        XLSX.writeFile(workbook, fileName);
    };


    // =================================================================
    // MAIN PROCESSING & CHILD CALLBACKS
    // =================================================================
    const startPeriodSelection = async () => {
        setError(null);
        const hasAnyFile = Object.keys(fileStatus).length > 0 || xmlFiles.nfeEntrada.length > 0 || xmlFiles.cte.length > 0 || xmlFiles.nfeSaida.length > 0 || xmlFiles.nfse.length > 0;
        if (!hasAnyFile) {
            toast({ variant: "destructive", title: "Nenhum arquivo carregado", description: "Por favor, carregue os XMLs ou as planilhas." });
            return;
        }

        setIsPreProcessing(true);
        setLogs(prev => [...prev, "Iniciando pré-processamento para detetar períodos..."]);

        try {
            const periods = new Set<string>();

            // 1. Process NFe/CTe XMLs
            const nfeCteXmls = [...xmlFiles.nfeEntrada, ...xmlFiles.cte, ...xmlFiles.nfeSaida];
            if (nfeCteXmls.length > 0) {
                const { nfe, cte, saidas } = await processUploadedXmls(nfeCteXmls, () => {}); // Use dummy log fn
                [...nfe, ...cte, ...saidas].forEach(doc => {
                    if (doc['Emissão'] && typeof doc['Emissão'] === 'string' && doc['Emissão'].length >= 7) {
                        periods.add(doc['Emissão'].substring(0, 7)); // YYYY-MM
                    }
                });
            }

            // 2. Process NFS-e XMLs
            if (xmlFiles.nfse.length > 0) {
                const nfseDates = await processNfseForPeriodDetection(xmlFiles.nfse);
                nfseDates.forEach(dateStr => {
                    if (dateStr && dateStr.length >= 7) {
                        periods.add(dateStr.substring(0, 7)); // YYYY-MM
                    }
                });
            }
            
            // 3. Process sheet files to get dates
            for (const fileName in files) {
                if (['NFE', 'CTE', 'Saídas'].includes(fileName)) {
                    files[fileName].forEach(row => {
                        const emissionValue = row['Emissão'] || row['Data de Emissão'];
                        if (emissionValue) {
                            try {
                                const date = emissionValue instanceof Date ? emissionValue : new Date(emissionValue);
                                if (!isNaN(date.getTime())) {
                                    // Adjust for timezone issues by formatting from UTC parts
                                    const year = date.getUTCFullYear();
                                    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
                                    periods.add(`${year}-${month}`);
                                }
                            } catch {}
                        }
                    });
                }
            }

            const sortedPeriods = Array.from(periods).sort().reverse();
            if (sortedPeriods.length === 0) {
                toast({ variant: "destructive", title: "Nenhum período encontrado", description: "Não foi possível detetar datas de emissão nos arquivos." });
                setIsPreProcessing(false);
                return;
            }
            
            setAvailablePeriods(sortedPeriods);
            // Pre-select all by default
            const initialSelection: Record<string, boolean> = {};
            sortedPeriods.forEach(p => { initialSelection[p] = true; });
            setSelectedPeriods(initialSelection);

            setIsPeriodModalOpen(true);

        } catch (err: any) {
            setError("Erro ao detetar períodos nos arquivos.");
            toast({ variant: "destructive", title: "Erro na pré-análise", description: err.message });
        } finally {
            setIsPreProcessing(false);
        }
    };


    const handleSubmit = () => {
        setError(null);
        setLogs([]);
        setProcessedData(prev => ({
             ...(prev || { sheets: {}, spedInfo: null, siengeSheetData: null, keyCheckResults: null }),
             sheets: {} // Clear only sheets, keep other state
        }));
        setIsPeriodModalOpen(false);
        
        setProcessing(true);
        
        setTimeout(async () => {
            try {
                const localLogs: string[] = [];
                const log = (message: string) => localLogs.push(`[${new Date().toLocaleTimeString()}] ${message}`);
                
                let dataToProcess: Record<string, any[]> = {};

                const allXmls = [...xmlFiles.nfeEntrada, ...xmlFiles.cte, ...xmlFiles.nfeSaida];
                const hasXmls = allXmls.length > 0;
                let eventCanceledKeys = new Set<string>();

                if (hasXmls) {
                    log(`Iniciando processamento de ${allXmls.length} XMLs.`);
                    const { nfe, cte, saidas, itens, itensSaidas, canceledKeys } = await processUploadedXmls(allXmls, log);
                    eventCanceledKeys = canceledKeys;
                    
                    dataToProcess["NFE"] = nfe;
                    dataToProcess["Itens"] = itens;
                    dataToProcess["CTE"] = cte;
                    dataToProcess["Saídas"] = saidas;
                    dataToProcess["Itens Saídas"] = itensSaidas;
                    
                    log(`Processamento XML concluído: ${nfe.length} NF-e Entradas, ${saidas.length} NF-e Saídas, ${cte.length} CT-es, ${canceledKeys.size} eventos de cancelamento.`);
                }
                
                // Prioriza os dados do XML, mas SEMPRE inclui os dados das planilhas de manifesto para filtragem.
                for (const fileName in files) {
                    const mappedName = fileMapping[fileName] || fileName;
                    const isManifestoFile = [
                        "NFE Operação Não Realizada", "NFE Operação Desconhecida", "CTE Desacordo de Serviço"
                    ].includes(fileName);
                    
                    if (isManifestoFile || !dataToProcess[mappedName] || dataToProcess[mappedName].length === 0) {
                        dataToProcess[mappedName] = files[fileName];
                        log(`Usando dados da planilha carregada: '${fileName}'.`);
                    } else {
                         log(`Dados de XML para '${mappedName}' encontrados, ignorando a planilha carregada: '${fileName}'.`);
                    }
                }
                
                // Date Range Filtering based on selected periods
                const activePeriods = Object.keys(selectedPeriods).filter(p => selectedPeriods[p]);
                if (activePeriods.length > 0) {
                    log(`Aplicando filtro de período para: ${activePeriods.join(', ')}`);
                
                    const filterByPeriod = (rows: any[]) => {
                        return rows.filter(row => {
                            const emissionValue = row['Emissão'] || row['Data de Emissão'];
                            if (!emissionValue) return true; // Keep rows without a date
                            if (typeof emissionValue === 'string' && emissionValue.length >= 7) {
                                return activePeriods.includes(emissionValue.substring(0, 7));
                            }
                            try {
                                const date = new Date(emissionValue);
                                if (isNaN(date.getTime())) return false;
                                const period = format(date, 'yyyy-MM');
                                return activePeriods.includes(period);
                            } catch {
                                return false; // Exclude rows with invalid date format
                            }
                        });
                    };
                
                    const originalNfeCount = dataToProcess['NFE']?.length || 0;
                    const originalCteCount = dataToProcess['CTE']?.length || 0;
                    const originalSaidasCount = dataToProcess['Saídas']?.length || 0;

                    const nfeFiltered = filterByPeriod(dataToProcess['NFE'] || []);
                    const cteFiltered = filterByPeriod(dataToProcess['CTE'] || []);
                    const saidasFiltered = filterByPeriod(dataToProcess['Saídas'] || []);
                    
                    const chavesNfe = new Set(nfeFiltered.map(n => n['Chave Unica']));
                    const chavesCte = new Set(cteFiltered.map(n => n['Chave Unica']));
                    const chavesSaidas = new Set(saidasFiltered.map(n => n['Chave Unica']));

                    dataToProcess['NFE'] = nfeFiltered;
                    dataToProcess['CTE'] = cteFiltered;
                    dataToProcess['Saídas'] = saidasFiltered;
                    
                    if(dataToProcess['Itens']) {
                        dataToProcess['Itens'] = (dataToProcess['Itens'] || []).filter(item => chavesNfe.has(item['Chave Unica']) || chavesCte.has(item['Chave Unica']));
                    }
                     if(dataToProcess['Itens Saídas']) {
                        dataToProcess['Itens Saídas'] = (dataToProcess['Itens Saídas'] || []).filter(item => chavesSaidas.has(item['Chave Unica']));
                    }

                    log(`Filtragem por período concluída: ${nfeFiltered.length}/${originalNfeCount} NF-e, ${cteFiltered.length}/${originalCteCount} CT-e, ${saidasFiltered.length}/${originalSaidasCount} Saídas.`);
                }

                // Now, process the combined and filtered data
                const resultData = processDataFrames(dataToProcess, eventCanceledKeys, log);
                setLogs(localLogs);

                if (!resultData) throw new Error("O processamento não retornou dados.");

                setProcessedData(prev => ({
                    ...prev, // Keep existing state like saidasStatus, etc.
                    ...resultData, // Overwrite with new results
                }));
                toast({ title: "Validação concluída", description: "Prossiga para as próximas etapas." });

            } catch (err: any) {
                const errorMessage = err.message || "Ocorreu um erro desconhecido durante o processamento.";
                setError(errorMessage);
                setProcessedData(prev => ({ 
                     ...(prev || { sheets: {}, spedInfo: null, siengeSheetData: null, keyCheckResults: null }),
                    sheets: {} 
                }));
                setLogs(prev => [...prev, `[ERRO FATAL] ${errorMessage}`]);
                toast({ variant: "destructive", title: "Erro no Processamento", description: errorMessage });
            } finally {
                setProcessing(false);
            }
        }, 50);
    };

    const handleSpedProcessed = useCallback((spedInfo: SpedInfo | null, keyCheckResults: KeyCheckResult | null) => {
        setProcessedData(prevData => {
            if (!prevData) {
                return {
                    sheets: {},
                    spedInfo: spedInfo || null,
                    siengeSheetData: null,
                    keyCheckResults: keyCheckResults || null,
                };
            }
            return {
                ...prevData,
                spedInfo: spedInfo,
                keyCheckResults: keyCheckResults,
            };
        });
    }, []);

    const handleSiengeDataProcessed = (siengeData: any[] | null) => {
        setProcessedData(prevData => {
            if (!prevData) {
                return {
                     sheets: {}, spedInfo: null,
                    siengeSheetData: siengeData,
                    keyCheckResults: null,
                };
            }
            return { ...prevData, siengeSheetData: siengeData };
        });
        if (siengeData) {
            toast({ title: "Dados Sienge Processados", description: "As análises de conferência de impostos foram atualizadas." });
        }
    };
    
    // =================================================================
    // UI CONTROL AND RENDER
    // =================================================================
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            toast({ title: "Copiado", description: "O erro foi copiado para la área de transferência." });
        }).catch(() => {
            toast({ variant: 'destructive', title: `Falha ao copiar` });
        });
    };

    const isProcessButtonDisabled = processing || isPreProcessing || (Object.keys(files).length === 0 && xmlFiles.nfeEntrada.length === 0 && xmlFiles.cte.length === 0 && xmlFiles.nfeSaida.length === 0 && xmlFiles.nfse.length === 0);
    const isClearButtonVisible = Object.keys(files).length > 0 || xmlFiles.nfeEntrada.length > 0 || xmlFiles.cte.length > 0 || xmlFiles.nfeSaida.length > 0 || xmlFiles.nfse.length > 0 || !!processedData || logs.length > 0 || error !== null;

    const nfStockTabDisabled = Object.keys(fileStatus).length === 0 && (xmlFiles.nfeEntrada.length === 0 && xmlFiles.cte.length === 0 && xmlFiles.nfeSaida.length === 0);
    const saidasNfeTabDisabled = !processedData?.sheets['Saídas'] || processedData.sheets['Saídas'].length === 0;
    const analysisTabDisabled = !processedData?.sheets['Chaves Válidas'] || processedData.sheets['Chaves Válidas'].length === 0;
    const imobilizadoTabDisabled = !processedData?.sheets['Imobilizados'] || processedData.sheets['Imobilizados'].length === 0;
    
    
    return (
        <div className="min-h-screen bg-background text-foreground">
            <header className="sticky top-0 z-20 w-full border-b bg-background/80 backdrop-blur-sm">
                <div className="container mx-auto flex h-16 items-center justify-between px-4">
                     <div className="flex items-center gap-4">
                        <Button asChild variant="outline" size="icon" title="Voltar ao início">
                            <Link href="/">
                                <Home className="h-5 w-5" />
                            </Link>
                        </Button>
                        <div className="flex items-center gap-2">
                           <Sheet className="h-6 w-6 text-primary" />
                           <h1 className="text-xl font-bold font-headline">Fluxo de Validação</h1>
                        </div>
                     </div>
                     <div className="flex items-center gap-2">
                        <SettingsDialog initialWideMode={isWideMode} onSettingsChange={handleSettingsChange} />
                        <ThemeToggle />
                     </div>
                </div>
            </header>

            <main className="container mx-auto p-4 md:p-8">
                <div className={cn("mx-auto space-y-8", isWideMode ? "max-w-full" : "max-w-screen-2xl")}>
                    <Tabs defaultValue="nf-stock" className="w-full">
                        <TabsList className="grid w-full grid-cols-1 md:grid-cols-5">
                             <TabsTrigger value="nf-stock" className="flex items-center gap-2">
                                1. Validação
                                {(Object.keys(fileStatus).length > 0 || xmlFiles.nfeEntrada.length > 0 || xmlFiles.cte.length > 0 || xmlFiles.nfeSaida.length > 0) && (
                                    processedData && Object.keys(processedData.sheets).length > 0 ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-yellow-600" />
                                )}
                            </TabsTrigger>
                            <TabsTrigger value="saidas-nfe" disabled={saidasNfeTabDisabled} className="flex items-center gap-2">
                                2. Análise Saídas
                                {processedData?.sheets['Saídas'] && <CheckCircle className="h-5 w-5 text-green-600" />}
                            </TabsTrigger>
                            <TabsTrigger value="nfse" className="flex items-center gap-2">
                                3. Análise NFS-e
                                {xmlFiles.nfse.length > 0 && <FilePieChart className="h-5 w-5 text-primary" />}
                            </TabsTrigger>
                            <TabsTrigger value="imobilizado" disabled={imobilizadoTabDisabled} className="flex items-center gap-2">
                                4. Imobilizado
                                {processedData?.sheets['Imobilizados'] && <CheckCircle className="h-5 w-5 text-green-600" />}
                            </TabsTrigger>
                            <TabsTrigger value="analyses" disabled={analysisTabDisabled} className="flex items-center gap-2">
                                5. Análises Finais
                                {processedData?.keyCheckResults && <CheckCircle className="h-5 w-5 text-green-600" />}
                            </TabsTrigger>
                        </TabsList>

                        {/* ======================= ABA 1: VALIDAÇÃO DE DOCUMENTOS ======================= */}
                        <TabsContent value="nf-stock" className="mt-6">
                             <Card className="shadow-lg">
                                <CardHeader>
                                    <div className="flex items-center gap-3">
                                        <UploadCloud className="h-8 w-8 text-primary" />
                                        <div>
                                            <CardTitle className="font-headline text-2xl">Carregar Arquivos</CardTitle>
                                            <CardDescription>Carregue os XMLs e/ou as planilhas para iniciar a validação.</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-8">
                                     <div>
                                        <h3 className="text-lg font-medium mb-4 flex items-center gap-2"><FileUp className="h-5 w-5" />Carregar por XML (Recomendado)</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                                            <div>
                                                <h4 className="text-md font-medium mb-2">XMLs NF-e Entrada</h4>
                                                <FileUploadForm
                                                    formId="xml-nfe-entrada"
                                                    files={{ 'xml-nfe-entrada': xmlFiles.nfeEntrada.length > 0 }}
                                                    onFileChange={(e) => handleXmlFileChange(e, 'nfeEntrada')}
                                                    onClearFile={() => handleClearFile('xml-nfe-entrada', 'nfeEntrada')}
                                                    xmlFileCount={xmlFiles.nfeEntrada.length}
                                                    displayName="XMLs NF-e Entrada"
                                                />
                                            </div>
                                            <div>
                                                <h4 className="text-md font-medium mb-2">XMLs CT-e</h4>
                                                <FileUploadForm
                                                    formId="xml-cte"
                                                    files={{ 'xml-cte': xmlFiles.cte.length > 0 }}
                                                    onFileChange={(e) => handleXmlFileChange(e, 'cte')}
                                                    onClearFile={() => handleClearFile('xml-cte', 'cte')}
                                                    xmlFileCount={xmlFiles.cte.length}
                                                    displayName="XMLs CT-e"
                                                />
                                            </div>
                                            <div>
                                                <h4 className="text-md font-medium mb-2">XMLs NF-e Saída</h4>
                                                <FileUploadForm
                                                    formId="xml-saida"
                                                    files={{ 'xml-saida': xmlFiles.nfeSaida.length > 0 }}
                                                    onFileChange={(e) => handleXmlFileChange(e, 'nfeSaida')}
                                                    onClearFile={() => handleClearFile('xml-saida', 'nfeSaida')}
                                                    xmlFileCount={xmlFiles.nfeSaida.length}
                                                    displayName="XMLs NF-e Saída"
                                                />
                                            </div>
                                            <div>
                                                <h4 className="text-md font-medium mb-2">XMLs NFS-e (Serviço)</h4>
                                                <FileUploadForm
                                                    formId="xml-nfse"
                                                    files={{ 'xml-nfse': xmlFiles.nfse.length > 0 }}
                                                    onFileChange={(e) => handleXmlFileChange(e, 'nfse')}
                                                    onClearFile={() => handleClearFile('xml-nfse', 'nfse')}
                                                    xmlFileCount={xmlFiles.nfse.length}
                                                    displayName="XMLs NFS-e"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="relative">
                                        <div className="absolute inset-0 flex items-center">
                                            <span className="w-full border-t" />
                                        </div>
                                        <div className="relative flex justify-center text-xs uppercase">
                                            <span className="bg-background px-2 text-muted-foreground">E/Ou</span>
                                        </div>
                                    </div>

                                     <div>
                                        <h3 className="text-lg font-medium mb-4 flex items-center gap-2"><Sheet className="h-5 w-5"/>Carregar Planilhas de Manifesto</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                             <FileUploadForm
                                                requiredFiles={requiredFiles}
                                                files={fileStatus}
                                                onFileChange={handleFileChange}
                                                onClearFile={handleClearFile}
                                            />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                             <Card className="shadow-lg mt-8">
                                <CardHeader>
                                        <div className="flex items-center gap-3">
                                        <Cpu className="h-8 w-8 text-primary" />
                                        <div>
                                            <CardTitle className="font-headline text-2xl">Processar Arquivos</CardTitle>
                                            <CardDescription>Inicie a validação dos dados carregados. Será solicitado que selecione o período.</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex flex-col sm:flex-row gap-2 pt-4">
                                        <Button onClick={startPeriodSelection} disabled={isProcessButtonDisabled} className="w-full">
                                            {isPreProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Analisando períodos...</> : (processing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Processando...</> : "Validar Dados")}
                                        </Button>
                                        {isClearButtonVisible && (
                                            <Button onClick={handleClearAllData} variant="destructive" className="w-full sm:w-auto">
                                                <Trash2 className="mr-2 h-4 w-4" /> Limpar Tudo
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {error && (
                                <Alert variant="destructive" className="mt-8">
                                    <div className="flex justify-between items-start">
                                        <div className="flex">
                                            <AlertCircle className="h-4 w-4" />
                                            <div className="ml-3">
                                                <AlertTitle>Erro</AlertTitle>
                                                <AlertDescription>{error}</AlertDescription>
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(error)}>
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </Alert>
                            )}

                             {(logs.length > 0) && (
                                <Card className="shadow-lg mt-8">
                                        <CardHeader>
                                        <div className="flex items-center gap-3">
                                            <Terminal className="h-8 w-8 text-primary" />
                                            <div>
                                                <CardTitle className="font-headline text-2xl">Análise de Processamento</CardTitle>
                                                <CardDescription>Logs detalhados da execução.</CardDescription>
                                            </div>
                                        </div>
                                    </CardHeader>
                                        <CardContent>
                                        <LogDisplay logs={logs} />
                                    </CardContent>
                                </Card>
                            )}
                            
                            {processedData?.sheets && Object.keys(processedData.sheets).length > 0 && (
                                <Card className="shadow-lg mt-8">
                                    <CardHeader>
                                        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex items-center gap-3">
                                                <CheckCircle className="h-8 w-8 text-primary" />
                                                <div>
                                                    <CardTitle className="font-headline text-2xl">Resultados da Validação</CardTitle>
                                                    <CardDescription>Visualize os dados processados. Os dados necessários para as próximas etapas estão prontos.</CardDescription>
                                                </div>
                                            </div>
                                            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                                                <Button onClick={handleDownloadExcel} className="w-full">
                                                    Baixar Planilha (.xlsx)
                                                </Button>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <ResultsDisplay results={processedData.sheets} />
                                    </CardContent>
                                </Card>
                            )}
                        </TabsContent>
                        
                        {/* ======================= ABA 2: Análise de Saídas (NF-e) ======================= */}
                        <TabsContent value="saidas-nfe" className="mt-6">
                             {processedData && processedData.sheets['Saídas'] ? (
                                <SaidasAnalysis 
                                    saidasData={processedData.sheets['Saídas']}
                                    initialStatus={processedData.saidasStatus || null}
                                    onStatusChange={(newStatus) => setProcessedData(p => p ? ({ ...p, saidasStatus: newStatus }) : null)}
                                    lastPeriodNumber={lastSaidaNumber}
                                    onLastPeriodNumberChange={handleLastSaidaNumberChange}
                                />
                             ) : (
                                  <Card><CardContent className="p-8 text-center text-muted-foreground"><TrendingUp className="mx-auto h-12 w-12 mb-4" /><h3 className="text-xl font-semibold mb-2">Aguardando dados</h3><p>Complete a "Validação de Documentos" para habilitar a análise de saídas.</p></CardContent></Card>
                             )}
                        </TabsContent>

                        {/* ======================= ABA 3: Análise NFS-e ======================= */}
                        <TabsContent value="nfse" className="mt-6">
                            <NfseAnalysis
                                nfseFiles={xmlFiles.nfse}
                                disregardedNotes={disregardedNfseNotes}
                                onDisregardedNotesChange={setDisregardedNfseNotes}
                            />
                        </TabsContent>
                        
                        {/* ======================= ABA 4: IMOBILIZADO ======================= */}
                        <TabsContent value="imobilizado" className="mt-6">
                             {processedData?.sheets?.Imobilizados ? (
                                <AdditionalAnalyses 
                                    processedData={processedData}
                                    onProcessedDataChange={setProcessedData}
                                    siengeFile={siengeFile}
                                    onSiengeFileChange={setSiengeFile}
                                    onSiengeDataProcessed={handleSiengeDataProcessed}
                                    onClearSiengeFile={() => {
                                        setSiengeFile(null);
                                        handleSiengeDataProcessed(null);
                                        const input = document.querySelector('input[name="Itens do Sienge"]') as HTMLInputElement;
                                        if (input) input.value = '';
                                    }}
                                    allXmlFiles={[...xmlFiles.nfeEntrada, ...xmlFiles.cte, ...xmlFiles.nfeSaida]}
                                    spedFiles={spedFiles}
                                    onSpedFilesChange={setSpedFiles}
                                    onSpedProcessed={handleSpedProcessed}
                                    competence={competence}
                                    activeTab="imobilizado" // Hint for the component
                                />
                             ) : (
                                  <Card><CardContent className="p-8 text-center text-muted-foreground"><Building className="mx-auto h-12 w-12 mb-4" /><h3 className="text-xl font-semibold mb-2">Aguardando dados</h3><p>Complete a "Validação" e verifique se há itens de imobilizado para habilitar esta etapa.</p></CardContent></Card>
                             )}
                        </TabsContent>

                        {/* ======================= ABA 5: ANÁLISES FINAIS ======================= */}
                         <TabsContent value="analyses" className="mt-6">
                             {processedData ? (
                                <AdditionalAnalyses 
                                    processedData={processedData}
                                    onProcessedDataChange={setProcessedData}
                                    siengeFile={siengeFile}
                                    onSiengeFileChange={setSiengeFile}
                                    onSiengeDataProcessed={handleSiengeDataProcessed}
                                    onClearSiengeFile={() => {
                                        setSiengeFile(null);
                                        handleSiengeDataProcessed(null);
                                        const input = document.querySelector('input[name="Itens do Sienge"]') as HTMLInputElement;
                                        if (input) input.value = '';
                                    }}
                                    allXmlFiles={[...xmlFiles.nfeEntrada, ...xmlFiles.cte, ...xmlFiles.nfeSaida]}
                                    spedFiles={spedFiles}
                                    onSpedFilesChange={setSpedFiles}
                                    onSpedProcessed={handleSpedProcessed}
                                    competence={competence}
                                    activeTab="analyses" // Hint for the component
                                />
                             ) : (
                                  <Card><CardContent className="p-8 text-center text-muted-foreground"><FileSearch className="mx-auto h-12 w-12 mb-4" /><h3 className="text-xl font-semibold mb-2">Aguardando dados</h3><p>Complete a "Validação de Documentos" para habilitar esta etapa.</p></CardContent></Card>
                             )}
                        </TabsContent>

                    </Tabs>
                </div>
            </main>
            
            {/* Period Selection Modal */}
            <Dialog open={isPeriodModalOpen} onOpenChange={setIsPeriodModalOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Filter /> Selecionar Períodos</DialogTitle>
                        <DialogDescription>
                            Selecione os meses de referência que deseja incluir no processamento.
                        </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="h-72 w-full rounded-md border p-4">
                        <div className="grid gap-4">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="select-all-periods"
                                    checked={Object.values(selectedPeriods).every(Boolean)}
                                    onCheckedChange={(checked) => {
                                        const newSelection: Record<string, boolean> = {};
                                        availablePeriods.forEach(p => { newSelection[p] = Boolean(checked); });
                                        setSelectedPeriods(newSelection);
                                    }}
                                />
                                <label htmlFor="select-all-periods" className="text-sm font-medium leading-none">
                                    Selecionar todos
                                </label>
                            </div>
                            <hr />
                            {availablePeriods.map(period => (
                                <div key={period} className="flex items-center space-x-2">
                                    <Checkbox
                                        id={`period-${period}`}
                                        checked={selectedPeriods[period] || false}
                                        onCheckedChange={(checked) => {
                                            setSelectedPeriods(prev => ({ ...prev, [period]: Boolean(checked) }))
                                        }}
                                    />
                                    <label htmlFor={`period-${period}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                        {format(parseISO(`${period}-01`), "MMMM 'de' yyyy", { locale: ptBR })}
                                    </label>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPeriodModalOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSubmit} disabled={Object.values(selectedPeriods).every(v => !v)}>
                            Processar Períodos Selecionados
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>


            <footer className="mt-12 border-t py-6">
                <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
                    <p>Powered by Firebase Studio. Interface intuitiva para automação de fluxos de trabalho.</p>
                </div>
            </footer>
        </div>
    );
}
```

---

## `src/lib/xml-processor.ts`

```ts
// Types
type LogFunction = (message: string) => void;

export interface XmlData {
    nfe: any[];
    cte: any[];
    itens: any[];
    saidas: any[];
    itensSaidas: any[];
    canceledKeys: Set<string>;
}

// =================================================================
// XML PARSING HELPERS
// =================================================================

const NFE_NAMESPACE = "http://www.portalfiscal.inf.br/nfe";
const CTE_NAMESPACE = "http://www.portalfiscal.inf.br/cte"; // Namespace for CTe
const GRANTEL_CNPJ = "81732042000119";

const getTagValue = (element: Element | undefined, tagName: string, namespace: string = NFE_NAMESPACE): string => {
    if (!element) return '';
    const tags = element.getElementsByTagNameNS(namespace, tagName);
    return tags[0]?.textContent ?? '';
};

const getCteTagValue = (element: Element | undefined, tagName: string): string => {
    if (!element) return '';
    const tags = element.getElementsByTagName(tagName); // CTe XML often does not use namespace prefixes consistently
    return tags[0]?.textContent ?? '';
};


const getAttributeValue = (element: Element | undefined, attributeName: string): string => {
     if (!element) return '';
     return element.getAttribute(attributeName) ?? '';
};

const cleanAndToStr = (value: any): string => {
    if (value === null || typeof value === 'undefined') return "";
    return String(value).replace(/\D/g, '');
};

const parseNFe = (xmlDoc: XMLDocument, log: LogFunction): Partial<XmlData> | null => {
    const nfeProcList = xmlDoc.getElementsByTagNameNS(NFE_NAMESPACE, 'nfeProc');
    if (nfeProcList.length === 0 || !nfeProcList[0]) {
        log("AVISO: Tag <nfeProc> não encontrada. O XML pode não ser um documento de NFe processado.");
        return null;
    }
    const nfeProc = nfeProcList[0];
    
    const nfeList = nfeProc.getElementsByTagNameNS(NFE_NAMESPACE, 'NFe');
    if (nfeList.length === 0 || !nfeList[0]) {
        log("AVISO: Tag <NFe> não encontrada no nfeProc.");
        return null;
    }
    const nfe = nfeList[0];
    
    const infNFeList = nfe.getElementsByTagNameNS(NFE_NAMESPACE, 'infNFe');
    if (infNFeList.length === 0 || !infNFeList[0]) {
        log("AVISO: Tag <infNFe> não encontrada na NFe.");
        return null;
    }
    const infNFe = infNFeList[0];

    const ide = infNFe.getElementsByTagNameNS(NFE_NAMESPACE, 'ide')[0];
    const emit = infNFe.getElementsByTagNameNS(NFE_NAMESPACE, 'emit')[0];
    const dest = infNFe.getElementsByTagNameNS(NFE_NAMESPACE, 'dest')[0];
    const total = infNFe.getElementsByTagNameNS(NFE_NAMESPACE, 'total')[0];
    const detList = infNFe.getElementsByTagNameNS(NFE_NAMESPACE, 'det');
    const protNFe = nfeProc.getElementsByTagNameNS(NFE_NAMESPACE, 'protNFe')[0];
    
    const infProt = protNFe?.getElementsByTagNameNS(NFE_NAMESPACE, 'infProt')[0];

    if (!ide || !emit || !dest || !total) {
        log("AVISO: Estrutura do XML NFe incompleta. Faltam tags essenciais como ide, emit, dest, ou total.");
        return null;
    }

    const chaveAcesso = getAttributeValue(infNFe, 'Id').replace('NFe', '');
    const nNF = getTagValue(ide, 'nNF');
    const dhEmiRaw = getTagValue(ide, 'dhEmi');
    const dhEmi = dhEmiRaw ? dhEmiRaw.substring(0, 10) : null;


    const emitCNPJ = getTagValue(emit, 'CNPJ');
    const emitNome = getTagValue(emit, 'xNome');
    const emitIE = getTagValue(emit, 'IE'); // Extrair a Inscrição Estadual do Emitente
    const destCNPJ = getTagValue(dest, 'CNPJ');
    const destNome = getTagValue(dest, 'xNome');
    const destIE = getTagValue(dest, 'IE');
    const enderDest = dest.getElementsByTagNameNS(NFE_NAMESPACE, 'enderDest')[0];
    const destUF = getTagValue(enderDest, 'UF');


    const vNF = getTagValue(total, 'vNF');
    
    let status = 'Autorizadas';
    if(infProt) {
        status = getTagValue(infProt, 'cStat') === '100' ? 'Autorizadas' : 'Canceladas';
    }


    const isSaida = cleanAndToStr(emitCNPJ) === GRANTEL_CNPJ;

    let notaFiscal: any = {
        'Chave de acesso': chaveAcesso,
        'Número': nNF,
        'Emissão': dhEmi,
        'Total': parseFloat(vNF) || 0,
        'Status': status,
    };
    
    if (isSaida) {
        notaFiscal['Destinatário'] = destNome;
        notaFiscal['CPF/CNPJ do Destinatário'] = destCNPJ;
    } else { // entrada
        notaFiscal['Fornecedor'] = emitNome;
        notaFiscal['CPF/CNPJ do Fornecedor'] = emitCNPJ;
        notaFiscal['emitCNPJ'] = emitCNPJ;
        notaFiscal['emitName'] = emitNome;
        notaFiscal['emitIE'] = emitIE; // Adicionar a IE do emitente aos dados da nota
        notaFiscal['destCNPJ'] = destCNPJ;
        notaFiscal['destIE'] = destIE;
        notaFiscal['destUF'] = destUF;
    }
    
    const chaveUnica = cleanAndToStr(nNF) + (isSaida ? cleanAndToStr(destCNPJ) : cleanAndToStr(emitCNPJ));
    notaFiscal['Chave Unica'] = chaveUnica;

    const itens: any[] = [];
    for (let i = 0; i < detList.length; i++) {
        const det = detList[i];
        if (!det) continue;
        const prod = det.getElementsByTagNameNS(NFE_NAMESPACE, 'prod')[0];
        const imposto = det.getElementsByTagNameNS(NFE_NAMESPACE, 'imposto')[0];
        if (!prod) continue;
        
        let item: any = {
            'Chave Unica': chaveUnica,
            'Item': getAttributeValue(det, 'nItem'),
            'Chave de acesso': chaveAcesso,
            'Número da Nota': nNF,
            'CPF/CNPJ do Emitente': emitCNPJ,
        };

        // Extrai todos os campos de <prod>
        for (const child of Array.from(prod.children)) {
            const tagName = child.tagName;
            const content = child.textContent;
            if (tagName && content) {
                item[`prod_${tagName}`] = content;
            }
        }
        
        // Renomeia os campos mais comuns para melhor legibilidade
        item['Código'] = item.prod_cProd;
        item['Descrição'] = item.prod_xProd;
        item['NCM'] = item.prod_NCM;
        item['CFOP'] = item.prod_CFOP;
        item['Unidade'] = item.prod_uCom;
        item['Quantidade'] = parseFloat(item.prod_qCom) || 0;
        item['Valor Unitário'] = parseFloat(item.prod_vUnCom) || 0;
        item['Valor Total'] = parseFloat(item.prod_vProd) || 0;

        // Adiciona explicitamente o CFOP e NCM ao nível principal do item se não estiverem já lá
        if (!item['CFOP']) item['CFOP'] = getTagValue(prod, 'CFOP');
        if (!item['NCM']) item['NCM'] = getTagValue(prod, 'NCM');


        // Extrai todos os campos de <imposto> e seus filhos
        if (imposto) {
            for (const taxGroup of Array.from(imposto.children)) {
                const taxGroupName = taxGroup.tagName; // ex: ICMS, PIS, COFINS
                 if (taxGroup.children.length > 1) { // Se for um grupo como ICMS00, PISAliq
                    const taxIdentifier = taxGroup.children[0].parentElement?.tagName;
                     for (const taxField of Array.from(taxGroup.children)) {
                        const fieldName = taxField.tagName;
                        const content = taxField.textContent;
                        if (fieldName && content) {
                             item[`${taxIdentifier}_${fieldName}`] = content;
                        }
                    }
                } else {
                     const fieldName = taxGroup.tagName;
                     const content = taxGroup.textContent;
                      if (fieldName && content) {
                           item[fieldName] = content;
                      }
                }
            }
        }

        itens.push(item);
    }
    
    if (isSaida) {
        return { nfe: [], itens: [], saidas: [notaFiscal], itensSaidas: itens, cte: [] };
    } else { // 'entrada'
        return { nfe: [notaFiscal], itens: itens, saidas: [], itensSaidas: [], cte: [] };
    }
};

const parseCTe = (xmlDoc: XMLDocument, log: LogFunction): Partial<XmlData> | null => {
    // CTe XMLs sometimes have inconsistent namespace usage. We'll try to get tags by name directly.
    const cteProc = xmlDoc.getElementsByTagName('cteProc')[0];
    if (!cteProc) {
        log("AVISO: Tag <cteProc> não encontrada. O XML pode não ser um documento de CTe processado.");
        return null;
    }
    
    const infCte = cteProc.getElementsByTagName('infCte')[0];
    const infProt = cteProc.getElementsByTagName('infProt')[0];

    if (!infCte || !infProt) {
        log("AVISO: Estrutura do XML CTe incompleta. Faltam tags essenciais como <infCte> ou <infProt>.");
        return null;
    }

    const ide = infCte.getElementsByTagName('ide')[0];
    const emit = infCte.getElementsByTagName('emit')[0];
    const rem = infCte.getElementsByTagName('rem')[0];
    const dest = infCte.getElementsByTagName('dest')[0];
    const vPrest = infCte.getElementsByTagName('vPrest')[0];

    if (!ide || !emit || !rem || !dest || !vPrest) {
        log("AVISO: Estrutura do XML CTe incompleta. Faltam tags filhas de <infCte> como ide, emit, rem, dest, ou vPrest.");
        return null;
    }
    
    const chaveAcesso = getAttributeValue(infCte, 'Id').replace('CTe', '');
    const nCT = getCteTagValue(ide, 'nCT');
    const serie = getCteTagValue(ide, 'serie'); // Extract the series
    const dhEmiRaw = getCteTagValue(ide, 'dhEmi');
    const dhEmi = dhEmiRaw ? dhEmiRaw.substring(0, 10) : null;
    const emitCNPJ = getCteTagValue(emit, 'CNPJ');
    const emitIE = getCteTagValue(emit, 'IE'); // Extrair IE do CTe também
    const vTPrest = getCteTagValue(vPrest, 'vTPrest');
    
    const status = getCteTagValue(infProt, 'cStat') === '100' ? 'Autorizadas' : 'Canceladas';

    const notaCte = {
        'Chave de acesso': chaveAcesso,
        'Número': nCT,
        'Série': serie, // Add series to the extracted data
        'Emissão': dhEmi,
        'Fornecedor': getCteTagValue(emit, 'xNome'),
        'CPF/CNPJ do Fornecedor': emitCNPJ,
        'emitIE': emitIE, // Adicionar a IE do emitente do CTe
        'Remetente': getCteTagValue(rem, 'xNome'),
        'CPF/CNPJ do Remetente': getCteTagValue(rem, 'CNPJ'),
        'Destinatário': getCteTagValue(dest, 'xNome'),
        'CPF/CNPJ do Destinatário': getCteTagValue(dest, 'CNPJ'),
        'Valor da Prestação': parseFloat(vTPrest) || 0,
        'Status': status,
        'Chave Unica': cleanAndToStr(nCT) + cleanAndToStr(emitCNPJ),
    };

    return { cte: [notaCte], nfe: [], itens: [], saidas: [], itensSaidas: [] };
};

const parseCancelEvent = (xmlDoc: XMLDocument, log: LogFunction): Partial<XmlData> | null => {
    const eventoList = xmlDoc.getElementsByTagNameNS(NFE_NAMESPACE, 'evento');
    if (eventoList.length === 0 || !eventoList[0]) return null;

    const infEvento = eventoList[0].getElementsByTagNameNS(NFE_NAMESPACE, 'infEvento')[0];
    if (!infEvento) return null;
    
    const tpEvento = getTagValue(infEvento, 'tpEvento');
    const descEvento = getTagValue(infEvento, 'descEvento');

    if (tpEvento === '110111' || descEvento.toLowerCase() === 'cancelamento') {
        const chNFe = getTagValue(infEvento, 'chNFe');
        if (chNFe) {
            log(`INFO: Evento de cancelamento detectado para a chave: ${chNFe}`);
            return { canceledKeys: new Set([chNFe]) };
        }
    }
    return null;
}

const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target && event.target.result instanceof ArrayBuffer) {
                const buffer = event.target.result;
                let decoder = new TextDecoder('utf-8', { fatal: true });
                try {
                    const text = decoder.decode(buffer);
                    if (text.includes('')) throw new Error("UTF-8 with replacement chars");
                    resolve(text);
                } catch(e) {
                    decoder = new TextDecoder('iso-8859-1');
                    resolve(decoder.decode(buffer));
                }
            } else {
                reject(new Error('Falha ao ler o ficheiro como ArrayBuffer.'));
            }
        };
        reader.onerror = () => {
            reject(new Error(`Erro ao ler o ficheiro: ${file.name}`));
        };
        reader.readAsArrayBuffer(file);
    });
};

export const processNfseForPeriodDetection = async (files: File[]): Promise<string[]> => {
    const dates: string[] = [];
    const parser = new DOMParser();

    const findValue = (root: Element, paths: string[]): string | null => {
        for (const path of paths) {
            const foundElement = root.querySelector(path);
            if (foundElement?.textContent) {
                return foundElement.textContent.trim();
            }
        }
        return null;
    }

    for (const file of files) {
        const xmlText = await readFileAsText(file);
        const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
        const root = xmlDoc.documentElement;

        const dateStr = findValue(root, ["data_nfse", "DataEmissao", "dhEmi"]);
        if (dateStr) {
            // Handle different date formats, e.g., DD/MM/YYYY or YYYY-MM-DD
            let date: Date;
            if (dateStr.includes('/')) {
                const parts = dateStr.split(' ')[0].split('/');
                if(parts.length === 3) {
                    date = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
                } else {
                    date = new Date('invalid');
                }
            } else {
                date = new Date(dateStr);
            }

            if (!isNaN(date.getTime())) {
                dates.push(date.toISOString());
            }
        }
    }
    return dates;
};


// =================================================================
// MAIN PROCESSING FUNCTION
// =================================================================

export const processUploadedXmls = async (files: File[], log: LogFunction): Promise<XmlData> => {
    const combinedData: XmlData = {
        nfe: [], cte: [], itens: [], saidas: [], itensSaidas: [], canceledKeys: new Set()
    };

    if (files.length === 0) {
        return combinedData;
    }

    log(`Processando ${files.length} arquivos XML.`);
    const parser = new DOMParser();

    for (const file of files) {
        try {
            const fileContent = await readFileAsText(file);
            const xmlDoc = parser.parseFromString(fileContent, "application/xml");
            
            const errorNode = xmlDoc.querySelector('parsererror');
            if (errorNode) {
                log(`AVISO: Falha ao parsear o arquivo ${file.name}. Não é um XML válido.`);
                continue;
            }

            let parsedResult: Partial<XmlData> | null = null;
            
            // Detect if it's NFe, CTe or a Cancellation Event and parse accordingly
             if (xmlDoc.getElementsByTagNameNS(NFE_NAMESPACE, 'procEventoNFe').length > 0 || xmlDoc.getElementsByTagName('procEventoCTe').length > 0) {
                parsedResult = parseCancelEvent(xmlDoc, log);
            } else if (xmlDoc.getElementsByTagNameNS(NFE_NAMESPACE, 'nfeProc').length > 0) {
                parsedResult = parseNFe(xmlDoc, log);
            } else if (xmlDoc.getElementsByTagName('cteProc').length > 0) { // Check without namespace for CTe
                parsedResult = parseCTe(xmlDoc, log);
            } else {
                // It might be an NFS-e, but this function is only for NFe/CTe, so we just log a warning.
                log(`AVISO: Arquivo ${file.name} não parece ser NFe, CTe ou Evento padrão. Será ignorado nesta função.`);
            }
            
            if(parsedResult) {
                if(parsedResult.nfe) combinedData.nfe.push(...parsedResult.nfe);
                if(parsedResult.cte) combinedData.cte.push(...parsedResult.cte);
                if(parsedResult.itens) combinedData.itens.push(...parsedResult.itens);
                if(parsedResult.saidas) combinedData.saidas.push(...parsedResult.saidas);
                if(parsedResult.itensSaidas) combinedData.itensSaidas.push(...parsedResult.itensSaidas);
                if(parsedResult.canceledKeys) {
                    parsedResult.canceledKeys.forEach(key => combinedData.canceledKeys.add(key));
                }
            }

        } catch (error: any) {
            log(`ERRO ao processar o arquivo ${file.name}: ${error.message}`);
        }
    }
    
    return combinedData;
};
```

---

## `src/lib/excel-processor.ts`

```ts
import { cfopDescriptions } from './cfop';
import * as XLSX from 'xlsx';
import { KeyCheckResult } from '@/components/app/key-checker';

// Types
type DataFrame = any[];
type DataFrames = { [key: string]: DataFrame };
type LogFunction = (message: string) => void;

export type SpedKeyObject = {
    key: string;
    foundInSped: boolean;
};

export type SpedInfo = {
    companyName: string;
    cnpj: string;
    competence: string;
};

export interface ProcessedData {
    sheets: DataFrames;
    spedInfo: SpedInfo | null;
    siengeSheetData: any[] | null;
    keyCheckResults: KeyCheckResult | null;
    saidasStatus?: Record<number, 'emitida' | 'cancelada' | 'inutilizada'>;
    lastSaidaNumber?: number;
    imobilizadoStatus?: Record<string, 'Uso e Consumo' | 'Ativo Imobilizado'>;
}


// =================================================================
// HELPERS
// =================================================================

const cleanAndToStr = (value: any): string => {
    if (value === null || typeof value === 'undefined') return "";
    return String(value).replace(/\D/g, '');
};

const addChaveUnica = (df: DataFrame): DataFrame => {
    if (!df || df.length === 0 || !df[0]) return df;
    
    // As chaves podem ter nomes ligeiramente diferentes dependendo da fonte (XML vs. planilha)
    const findKey = (possibleNames: string[]) => Object.keys(df[0]).find(k => possibleNames.includes(k.toLowerCase()));

    const numeroKey = findKey(['número', 'numero']);
    const cpfCnpjKey = findKey(['cpf/cnpj do fornecedor', 'cpf/cnpj', 'cpf/cnpj do destinatário']);
    
    if (!numeroKey || !cpfCnpjKey) return df;

    return df.map(row => {
        if(row && typeof row === 'object' && numeroKey in row && cpfCnpjKey in row) {
            const chaveUnica = cleanAndToStr(row[numeroKey]) + cleanAndToStr(row[cpfCnpjKey]);
            return { "Chave Unica": chaveUnica, ...row };
        }
        return row;
    });
};


const renameChaveColumn = (df: DataFrame): DataFrame => {
    if (!df || df.length === 0) return df;
    
    return df.map(row => {
        if (!row || typeof row !== 'object') return row;
        
        const chaveKey = Object.keys(row).find(k => k.toLowerCase() === 'chave');
        if (!chaveKey) return row;

        const { [chaveKey]: Chave, ...rest } = row;
        return { 'Chave de acesso': Chave, ...rest };
    });
};


// =================================================================
// MAIN PROCESSING FUNCTION
// =================================================================

export function processDataFrames(dfs: DataFrames, eventCanceledKeys: Set<string>, log: LogFunction): ProcessedData {
    
    log("Iniciando preparação dos dados no navegador...");
    const originalDfs: DataFrames = {};
    const processedDfs: DataFrames = {};

    const allSheetNames = [
        "NFE", "CTE", "Itens", "Saídas", "Itens Saídas",
        "NFE Operação Não Realizada", "NFE Operação Desconhecida", 
        "CTE Desacordo de Serviço"
    ];

    allSheetNames.forEach(name => {
        const rawData = dfs[name] ? [...dfs[name]] : [];
        const originalName = `Original - ${name}`;
        if (rawData.length > 0) {
            originalDfs[originalName] = rawData; 
            log(`- Copiando dados originais de '${name}'.`);
        }

        let processedData = addChaveUnica(rawData);
        if (["NFE Operação Não Realizada", "NFE Operação Desconhecida", "CTE Desacordo de Serviço"].includes(name)) {
            processedData = renameChaveColumn(processedData);
        }
        processedDfs[name] = processedData;
    });
    log("Preparação inicial concluída.");

    const nfe = processedDfs["NFE"] || [];
    const cte = processedDfs["CTE"] || [];
    const itens = processedDfs["Itens"] || [];
    const saidas = processedDfs["Saídas"] || [];
    const itensSaidas = processedDfs["Itens Saídas"] || [];
    const naoRealizada = processedDfs["NFE Operação Não Realizada"] || [];
    const desconhecida = processedDfs["NFE Operação Desconhecida"] || [];
    const desacordo = processedDfs["CTE Desacordo de Serviço"] || [];

    log("Identificando emissões próprias do fornecedor (devoluções)...");
    const chavesEmissaoPropriaEntrada = new Set<string>();
    itens.forEach(item => {
        if (!item || !item["CFOP"]) return;
        const cfop = cleanAndToStr(item["CFOP"]);
        // Regra: Qualquer CFOP de entrada iniciado com 1 ou 2 é considerado uma devolução/retorno.
        if (cfop.startsWith('1') || cfop.startsWith('2')) {
            chavesEmissaoPropriaEntrada.add(cleanAndToStr(item["Chave Unica"]));
        }
    });
    log(`- ${chavesEmissaoPropriaEntrada.size} chaves únicas de emissão própria de fornecedor (devolução) identificadas.`);

    log("Coletando chaves de exceção (canceladas, manifesto, eventos)...");
    const chavesExcecao = new Set<string>(eventCanceledKeys);
    log(`- ${eventCanceledKeys.size} chaves de cancelamento por evento adicionadas.`);

    const addExceptions = (df: DataFrame, chaveKey: string, statusKey?: string) => {
        df.forEach(row => {
            if (!row) return;
            const statusVal = statusKey ? row[statusKey] : '';
            const isCancelled = typeof statusVal === 'string' && statusVal.toLowerCase().includes('cancelada');
            const statusOk = statusKey ? isCancelled : true;
            const chave = cleanAndToStr(row[chaveKey]) || cleanAndToStr(row['Chave de acesso']);
            if (statusOk && chave) {
                chavesExcecao.add(chave);
            }
        });
    };
    
    // Adiciona canceladas encontradas nos XMLs/planilhas principais
    addExceptions(nfe, "Chave de acesso", "Status");
    addExceptions(cte, "Chave de acesso", "Status");
    addExceptions(saidas, "Chave de acesso", "Status");
    
    // Adiciona todas das planilhas de manifesto
    addExceptions(naoRealizada, "Chave de acesso");
    addExceptions(desconhecida, "Chave de acesso");
    addExceptions(desacordo, "Chave de acesso");

    log(`- Total de ${chavesExcecao.size} chaves de exceção coletadas (canceladas, manifesto, eventos).`);

    log("Filtrando notas e itens válidos...");
    
    const isChaveValida = (row: any) => {
        if(!row) return false;
        const chaveAcesso = cleanAndToStr(row['Chave de acesso']);
        return chaveAcesso && !chavesExcecao.has(chaveAcesso);
    }
    
    const nfeFiltrada = nfe.filter(row => row && !Object.values(row).some(v => typeof v === 'string' && v.toUpperCase().includes("TOTAL")));
    const cteFiltrado = cte.filter(row => row && !Object.values(row).some(v => typeof v === 'string' && v.toUpperCase().includes("TOTAL")));
    
    let notasValidas = nfeFiltrada.filter(row => isChaveValida(row) && !chavesEmissaoPropriaEntrada.has(cleanAndToStr(row["Chave Unica"])));
    let ctesValidos = cteFiltrado.filter(row => isChaveValida(row)); // CTes não são 'emissão própria' neste contexto
    let saidasValidas = saidas.filter(row => isChaveValida(row));
    
    log(`- Total de ${notasValidas.length} NF-es válidas (entradas de terceiros).`);
    log(`- Total de ${ctesValidos.length} CT-es válidos.`);
    
    const chavesNotasValidas = new Set(notasValidas.map(row => cleanAndToStr(row["Chave Unica"])));
    let itensValidos = itens.filter(item => {
        const chaveUnica = cleanAndToStr(item["Chave Unica"]);
        // Itens de emissão própria não são incluídos em "Itens Válidos".
        return chavesNotasValidas.has(chaveUnica) && !chavesEmissaoPropriaEntrada.has(chaveUnica);
    });
    log(`- ${itensValidos.length} itens válidos correspondentes.`);

    log("Identificando itens de Uso e Consumo e Ativo Imobilizado...");
    const imobilizadoCfops = ['1551', '2551', '1556', '2556'];
    const imobilizados = itensValidos.filter(item => {
        const cfop = cleanAndToStr(item["CFOP"]);
        return imobilizadoCfops.includes(cfop);
    }).map((item, index) => ({ ...item, id: `${cleanAndToStr(item['Chave Unica'])}-${index}` }));
    log(`- ${imobilizados.length} itens de Uso e Consumo ou Ativo Imobilizado encontrados.`);


    log(`- ${saidasValidas.length} saídas válidas encontradas.`);

    const chavesSaidasValidas = new Set(saidasValidas.map(row => cleanAndToStr(row["Chave Unica"])));
    const itensValidosSaidas = itensSaidas.filter(item => chavesSaidasValidas.has(cleanAndToStr(item["Chave Unica"])));
    log(`- ${itensValidosSaidas.length} itens de saída válidos correspondentes.`);

    log("Agrupando resultados...");
    const notasCanceladas = [...nfe, ...cte, ...saidas].filter(row => {
        if (!row) return false;
        const statusVal = row["Status"];
        const isCancelled = typeof statusVal === 'string' && statusVal.toLowerCase().includes('cancelada');
        return isCancelled || chavesExcecao.has(cleanAndToStr(row["Chave de acesso"]));
    });
    const emissaoPropria = [...nfeFiltrada, ...cteFiltrado].filter(row => chavesEmissaoPropriaEntrada.has(cleanAndToStr(row["Chave Unica"])));
    
    const chavesValidasEntrada = notasValidas.map(row => ({
        "Chave de acesso": cleanAndToStr(row["Chave de acesso"]),
        "Tipo": "NFE",
        "Fornecedor": row["Fornecedor"],
        "Emissão": String(row["Emissão"]).substring(0, 10),
        "Total": row['Total'] || 0,
        // Campos para verificação de cadastro
        "destCNPJ": row.destCNPJ,
        "destIE": row.destIE,
        "destUF": row.destUF,
        "emitCNPJ": row.emitCNPJ,
        "emitName": row.emitName,
        "emitIE": row.emitIE,
    }));

    const chavesValidasCte = ctesValidos.map(row => ({
        "Chave de acesso": cleanAndToStr(row["Chave de acesso"]),
        "Tipo": "CTE",
        "Fornecedor": row["Fornecedor"],
        "Emissão": String(row["Emissão"]).substring(0, 10),
        "Total": row['Valor da Prestação'] || 0,
    }));

    const chavesValidasSaida = saidasValidas.map(row => ({
        "Chave de acesso": cleanAndToStr(row["Chave de acesso"]),
        "Tipo": 'Saída',
        "Fornecedor": row["Destinatário"], // Usando 'Fornecedor' como campo genérico para simplificar
        "Emissão": String(row["Emissão"]).substring(0, 10),
        "Total": row['Total'] || 0,
    }));

    const chavesValidas = [...chavesValidasEntrada, ...chavesValidasCte, ...chavesValidasSaida];

    log(`- ${chavesValidas.length} chaves válidas para verificação SPED geradas.`);
    
    const finalResult: DataFrames = {
        "Notas Válidas": notasValidas,
        "CTEs Válidos": ctesValidos,
        "Itens Válidos": itensValidos, "Chaves Válidas": chavesValidas,
        "Saídas": saidasValidas, "Itens Válidos Saídas": itensValidosSaidas,
        "Imobilizados": imobilizados,
        "Emissão Própria": emissaoPropria, "Notas Canceladas": notasCanceladas,
        ...originalDfs 
    };
    
    const addCfopDescriptionToRow = (row: any) => {
        if (!row || typeof row !== 'object') {
            return { ...row, 'Descricao CFOP': 'N/A' };
        }
        if (!row['CFOP']) {
            // Find CFOP in related items if not present in the main row
            const chaveUnica = cleanAndToStr(row['Chave Unica']);
            const relatedItem = itens.find(item => cleanAndToStr(item['Chave Unica']) === chaveUnica && item['CFOP']);
            if (relatedItem) {
                row['CFOP'] = relatedItem['CFOP'];
            } else {
                return { ...row, 'Descricao CFOP': 'N/A' };
            }
        }
        const cfopCode = parseInt(cleanAndToStr(row['CFOP']), 10);
        const fullDescription = cfopDescriptions[cfopCode] || 'Descrição não encontrada';
        const shortDescription = fullDescription.split(' ').slice(0, 3).join(' ');

        const newRow: { [key: string]: any } = {};
        const cfopIndex = Object.keys(row).indexOf('CFOP');

        Object.keys(row).forEach((key, index) => {
            newRow[key] = row[key];
            if (index === cfopIndex) {
                 newRow['Descricao CFOP'] = shortDescription;
            }
        });
        return newRow;
    };
    
    const finalSheetSet: DataFrames = {};
    const displayOrder = [
        "Notas Válidas", "CTEs Válidos", "Itens Válidos", "Chaves Válidas", "Saídas", "Itens Válidos Saídas",
        "Imobilizados",
        "Emissão Própria", "Notas Canceladas", ...Object.keys(originalDfs)
    ];

    displayOrder.forEach(name => {
        let sheetData = finalResult[name];
        if (sheetData && sheetData.length > 0) {
            if (["Itens Válidos", "Emissão Própria", "Itens Válidos Saídas", "Saídas", "Notas Válidas", "Imobilizados"].includes(name)) {
                 sheetData = sheetData.map(addCfopDescriptionToRow);
            }
            finalSheetSet[name] = sheetData;
        }
    });
    log("Processamento concluído. Resultados estão prontos para as próximas etapas.");

    return {
        sheets: finalSheetSet,
        spedInfo: null,
        siengeSheetData: null,
        keyCheckResults: null,
    };
}
```

---

## `src/lib/columns-helper.tsx`

```tsx
"use client"

import { ColumnDef } from "@tanstack/react-table"
import { ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Row } from "@tanstack/react-table";

type CustomCellRender<TData> = (row: Row<TData>, id: string) => React.ReactNode;

export function getColumns<TData extends Record<string, any>>(data: TData[]): ColumnDef<TData>[] {
  if (!data || data.length === 0) {
    return []
  }

  const keys = Object.keys(data[0] as object) as (keyof TData)[];

  return keys.map((key) => {
      const columnId = String(key);
      return {
        id: columnId,
        accessorKey: columnId,
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              {columnId}
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => {
            const value = row.getValue(columnId);
            if (value === null || typeof value === 'undefined') {
              return <span className="text-muted-foreground">N/A</span>;
            }
            return <div>{String(value)}</div>;
        },
      };
  });
}

export function getColumnsWithCustomRender<TData extends Record<string, any>>(
    data: TData[],
    columnsToShow: (keyof TData)[],
    customCellRender?: CustomCellRender<TData>
): ColumnDef<TData>[] {
    if (!data || data.length === 0) {
        return [];
    }

    const availableColumns = Object.keys(data[0] as object) as (keyof TData)[];
    const columnsToRender = columnsToShow.filter(key => availableColumns.includes(key));

    return columnsToRender.map((key) => {
        const columnId = String(key);
        return {
            id: columnId, // Explicitly set the ID
            accessorKey: columnId, // And the accessorKey
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    {columnId}
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ),
            cell: ({ row }) => customCellRender ? customCellRender(row, columnId) : (
                <div>{String(row.getValue(columnId) ?? '')}</div>
            ),
        };
    });
}
```

---

## `src/lib/utils.ts`

```ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatCnpj = (cnpj: string) => {
    if (!cnpj) return '';
    const digitsOnly = cnpj.replace(/\D/g, '');
    if (digitsOnly.length !== 14) return cnpj;
    return digitsOnly.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
};

export const cleanAndToStr = (value: any): string => {
    if (value === null || typeof value === 'undefined') return "";
    let strValue = String(value).trim();
    // Limpa strings que são representações de floats, como "1234.0"
    if (/^\d+\.0+$/.test(strValue)) strValue = strValue.split('.')[0];
    return strValue;
};


export const parseSpedDate = (dateStr: string): Date => {
    if (!dateStr || dateStr.length !== 8) return new Date('invalid');
    const day = parseInt(dateStr.substring(0, 2), 10);
    const month = parseInt(dateStr.substring(2, 4), 10) - 1; // Mês é 0-indexado
    const year = parseInt(dateStr.substring(4, 8), 10);
    return new Date(year, month, day);
};
```

---

## `src/lib/cfop.ts`

```ts
// src/lib/cfop.ts

export const cfopDescriptions: { [key: number]: string } = {
    1101: 'Compra p/ industrialização ou produção rural',
    1102: 'Compra p/ comercialização',
    1111: 'Compra p/ industrialização de mercadoria recebida anteriormente em consignação industrial',
    1113: 'Compra p/ comercialização, de mercadoria recebida anteriormente em consignação mercantil',
    1116: 'Compra p/ industrialização ou produção rural originada de encomenda p/ recebimento futuro',
    1117: 'Compra p/ comercialização originada de encomenda p/ recebimento futuro',
    1118: 'Compra de mercadoria p/ comercialização pelo adquirente originário, entregue pelo vendedor remetente ao destinatário, em venda à ordem.',
    1120: 'Compra p/ industrialização, em venda à ordem, já recebida do vendedor remetente',
    1121: 'Compra p/ comercialização, em venda à ordem, já recebida do vendedor remetente',
    1122: 'Compra p/ industrialização em que a mercadoria foi remetida pelo fornecedor ao industrializador sem transitar pelo estabelecimento adquirente',
    1124: 'Industrialização efetuada por outra empresa',
    1125: 'Industrialização efetuada por outra empresa quando a mercadoria remetida p/ utilização no processo de industrialização não transitou pelo estabelecimento adquirente da mercadoria',
    1126: 'Compra p/ utilização na prestação de serviço sujeita ao ICMS',
    1128: 'Compra p/ utilização na prestação de serviço sujeita ao ISSQN',
    1151: 'Transferência p/ industrialização ou produção rural',
    1152: 'Transferência p/ comercialização',
    1153: 'Transferência de energia elétrica p/ distribuição',
    1154: 'Transferência p/ utilização na prestação de serviço',
    1201: 'Devolução de venda de produção do estabelecimento',
    1202: 'Devolução de venda de mercadoria adquirida ou recebida de terceiros',
    1203: 'Devolução de venda de produção do estabelecimento, destinada à ZFM ou ALC',
    1204: 'Devolução de venda de mercadoria adquirida ou recebida de terceiros, destinada à ZFM ou ALC',
    1205: 'Anulação de valor relativo à prestação de serviço de comunicação',
    1206: 'Anulação de valor relativo à prestação de serviço de transporte',
    1207: 'Anulação de valor relativo à venda de energia elétrica',
    1208: 'Devolução de produção do estabelecimento, remetida em transferência',
    1209: 'Devolução de mercadoria adquirida ou recebida de terceiros, remetida em transferência',
    1212: 'Devolução de venda no mercado interno de mercadoria industrializada e insumo importado sob o Regime Aduaneiro Especial de Entreposto Industrial (Recof-Sped)',
    1251: 'Compra de energia elétrica p/ distribuição ou comercialização',
    1252: 'Compra de energia elétrica por estabelecimento industrial',
    1253: 'Compra de energia elétrica por estabelecimento comercial',
    1254: 'Compra de energia elétrica por estabelecimento prestador de serviço de transporte',
    1255: 'Compra de energia elétrica por estabelecimento prestador de serviço de comunicação',
    1256: 'Compra de energia elétrica por estabelecimento de produtor rural',
    1257: 'Compra de energia elétrica p/ consumo por demanda contratada',
    1301: 'Aquisição de serviço de comunicação p/ execução de serviço da mesma natureza',
    1302: 'Aquisição de serviço de comunicação por estabelecimento industrial',
    1303: 'Aquisição de serviço de comunicação por estabelecimento comercial',
    1304: 'Aquisição de serviço de comunicação por estabelecimento de prestador de serviço de transporte',
    1305: 'Aquisição de serviço de comunicação por estabelecimento de geradora ou de distribuidora de energia elétrica',
    1306: 'Aquisição de serviço de comunicação por estabelecimento de produtor rural',
    1351: 'Aquisição de serviço de transporte p/ execução de serviço da mesma natureza',
    1352: 'Aquisição de serviço de transporte por estabelecimento industrial',
    1353: 'Aquisição de serviço de transporte por estabelecimento comercial',
    1354: 'Aquisição de serviço de transporte por estabelecimento de prestador de serviço de comunicação',
    1355: 'Aquisição de serviço de transporte por estabelecimento de geradora ou de distribuidora de energia elétrica',
    1356: 'Aquisição de serviço de transporte por estabelecimento de produtor rural',
    1360: 'Aquisição de serviço de transporte por contribuinte-substituto em relação ao serviço de transporte',
    1401: 'Compra p/ industrialização ou produção rural de mercadoria sujeita a ST',
    1403: 'Compra p/ comercialização em operação com mercadoria sujeita a ST',
    1406: 'Compra de bem p/ o ativo imobilizado cuja mercadoria está sujeita a ST',
    1407: 'Compra de mercadoria p/ uso ou consumo cuja mercadoria está sujeita a ST',
    1408: 'Transferência p/ industrialização ou produção rural de mercadoria sujeita a ST',
    1409: 'Transferência p/ comercialização em operação com mercadoria sujeita a ST',
    1410: 'Devolução de venda de mercadoria, de produção do estabelecimento, sujeita a ST',
    1411: 'Devolução de venda de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita a ST',
    1414: 'Retorno de mercadoria de produção do estabelecimento, remetida p/ venda fora do estabelecimento, sujeita a ST',
    1415: 'Retorno de mercadoria adquirida ou recebida de terceiros, remetida p/ venda fora do estabelecimento em operação com mercadoria sujeita a ST',
    1451: 'Retorno de animal do estabelecimento produtor',
    1452: 'Retorno de insumo não utilizado na produção',
    1501: 'Entrada de mercadoria recebida com fim específico de exportação',
    1503: 'Entrada decorrente de devolução de produto, de fabricação do estabelecimento, remetido com fim específico de exportação',
    1504: 'Entrada decorrente de devolução de mercadoria remetida com fim específico de exportação, adquirida ou recebida de terceiros',
    1505: 'Entrada decorrente de devolução simbólica de mercadoria remetida p/ formação de lote de exportação, de produto industrializado ou produzido pelo próprio estabelecimento.',
    1506: 'Entrada decorrente de devolução simbólica de mercadoria, adquirida ou recebida de terceiros, remetida p/ formação de lote de exportação.',
    1551: 'Compra de bem p/ o ativo imobilizado',
    1552: 'Transferência de bem do ativo imobilizado',
    1553: 'Devolução de venda de bem do ativo imobilizado',
    1554: 'Retorno de bem do ativo imobilizado remetido p/ uso fora do estabelecimento',
    1555: 'Entrada de bem do ativo imobilizado de terceiro, remetido p/ uso no estabelecimento',
    1556: 'Compra de material p/ uso ou consumo',
    1557: 'Transferência de material p/ uso ou consumo',
    1601: 'Recebimento, por transferência, de crédito de ICMS',
    1602: 'Recebimento, por transferência, de saldo credor do ICMS, de outro estabelecimento da mesma empresa, p/ compensação de saldo devedor do imposto.',
    1603: 'Ressarcimento de ICMS retido por substituição tributária',
    1604: 'Lançamento do crédito relativo à compra de bem p/ o ativo imobilizado',
    1605: 'Recebimento, por transferência, de saldo devedor do ICMS de outro estabelecimento da mesma empresa',
    1651: 'Compra de combustível ou lubrificante p/ industrialização subseqüente',
    1652: 'Compra de combustível ou lubrificante p/ comercialização',
    1653: 'Compra de combustível ou lubrificante por consumidor ou usuário final',
    1658: 'Transferência de combustível ou lubrificante p/ industrialização',
    1659: 'Transferência de combustível ou lubrificante p/ comercialização',
    1660: 'Devolução de venda de combustível ou lubrificante destinados à industrialização subseqüente',
    1661: 'Devolução de venda de combustível ou lubrificante destinados à comercialização',
    1662: 'Devolução de venda de combustível ou lubrificante destinados a consumidor ou usuário final',
    1663: 'Entrada de combustível ou lubrificante p/ armazenagem',
    1664: 'Retorno de combustível ou lubrificante remetidos p/ armazenagem',
    1901: 'Entrada p/ industrialização por encomenda',
    1902: 'Retorno de mercadoria remetida p/ industrialização por encomenda',
    1903: 'Entrada de mercadoria remetida p/ industrialização e não aplicada no referido processo',
    1904: 'Retorno de remessa p/ venda fora do estabelecimento',
    1905: 'Entrada de mercadoria recebida p/ depósito em depósito fechado ou armazém geral',
    1906: 'Retorno de mercadoria remetida p/ depósito fechado ou armazém geral',
    1907: 'Retorno simbólico de mercadoria remetida p/ depósito fechado ou armazém geral',
    1908: 'Entrada de bem por conta de contrato de comodato',
    1909: 'Retorno de bem remetido por conta de contrato de comodato',
    1910: 'Entrada de bonificação, doação ou brinde',
    1911: 'Entrada de amostra grátis',
    1912: 'Entrada de mercadoria ou bem recebido p/ demonstração',
    1913: 'Retorno de mercadoria ou bem remetido p/ demonstração',
    1914: 'Retorno de mercadoria ou bem remetido p/ exposição ou feira',
    1915: 'Entrada de mercadoria ou bem recebido p/ conserto ou reparo',
    1916: 'Retorno de mercadoria ou bem remetido p/ conserto ou reparo',
    1917: 'Entrada de mercadoria recebida em consignação mercantil ou industrial',
    1918: 'Devolução de mercadoria remetida em consignação mercantil ou industrial',
    1919: 'Devolução simbólica de mercadoria vendida ou utilizada em processo industrial, remetida anteriormente em consignação mercantil ou industrial',
    1920: 'Entrada de vasilhame ou sacaria',
    1921: 'Retorno de vasilhame ou sacaria',
    1922: 'Lançamento efetuado a título de simples faturamento decorrente de compra p/ recebimento futuro',
    1923: 'Entrada de mercadoria recebida do vendedor remetente, em venda à ordem',
    1924: 'Entrada p/ industrialização por conta e ordem do adquirente da mercadoria, quando esta não transitar pelo estabelecimento do adquirente',
    1925: 'Retorno de mercadoria remetida p/ industrialização por conta e ordem do adquirente da mercadoria, quando esta não transitar pelo estabelecimento do adquirente',
    1926: 'Lançamento efetuado a título de reclassificação de mercadoria decorrente de formação de kit ou de sua desagregação',
    1931: 'Lançamento efetuado pelo tomador do serviço de transporte, quando a responsabilidade de retenção do imposto for atribuída ao remetente ou alienante da mercadoria, pelo serviço de transporte realizado por transportador autônomo ou por transportador não-inscrito na UF onde se tenha iniciado o serviço.',
    1932: 'Aquisição de serviço de transporte iniciado em UF diversa daquela onde esteja inscrito o prestador',
    1933: 'Aquisição de serviço tributado pelo Imposto sobre Serviços de Qualquer Natureza',
    1934: 'Entrada simbólica de mercadoria recebida p/ depósito fechado ou armazém geral',
    1949: 'Outra entrada de mercadoria ou prestação de serviço não especificada',
    2101: 'Compra p/ industrialização ou produção rural',
    2102: 'Compra p/ comercialização',
    2111: 'Compra p/ industrialização de mercadoria recebida anteriormente em consignação industrial',
    2113: 'Compra p/ comercialização, de mercadoria recebida anteriormente em consignação mercantil',
    2116: 'Compra p/ industrialização ou produção rural originada de encomenda p/ recebimento futuro',
    2117: 'Compra p/ comercialização originada de encomenda p/ recebimento futuro',
    2118: 'Compra de mercadoria p/ comercialização pelo adquirente originário, entregue pelo vendedor remetente ao destinatário, em venda à ordem',
    2120: 'Compra p/ industrialização, em venda à ordem, já recebida do vendedor remetente',
    2121: 'Compra p/ comercialização, em venda à ordem, já recebida do vendedor remetente',
    2122: 'Compra p/ industrialização em que a mercadoria foi remetida pelo fornecedor ao industrializador sem transitar pelo estabelecimento adquirente',
    2124: 'Industrialização efetuada por outra empresa',
    2125: 'Industrialização efetuada por outra empresa quando a mercadoria remetida p/ utilização no processo de industrialização não transitou pelo estabelecimento adquirente da mercadoria',
    2126: 'Compra p/ utilização na prestação de serviço sujeita ao ICMS',
    2128: 'Compra p/ utilização na prestação de serviço sujeita ao ISSQN',
    2151: 'Transferência p/ industrialização ou produção rural',
    2152: 'Transferência p/ comercialização',
    2153: 'Transferência de energia elétrica p/ distribuição',
    2154: 'Transferência p/ utilização na prestação de serviço',
    2201: 'Devolução de venda de produção do estabelecimento',
    2202: 'Devolução de venda de mercadoria adquirida ou recebida de terceiros',
    2203: 'Devolução de venda de produção do estabelecimento destinada à ZFM ou ALC',
    2204: 'Devolução de venda de mercadoria adquirida ou recebida de terceiros, destinada à ZFM ou ALC',
    2205: 'Anulação de valor relativo à prestação de serviço de comunicação',
    2206: 'Anulação de valor relativo à prestação de serviço de transporte',
    2207: 'Anulação de valor relativo à venda de energia elétrica',
    2208: 'Devolução de produção do estabelecimento, remetida em transferência.',
    2209: 'Devolução de mercadoria adquirida ou recebida de terceiros e remetida em transferência',
    2212: 'Devolução de venda no mercado interno de mercadoria industrializada e insumo importado sob o Regime Aduaneiro Especial de Entreposto Industrial (Recof-Sped)',
    2251: 'Compra de energia elétrica p/ distribuição ou comercialização',
    2252: 'Compra de energia elétrica por estabelecimento industrial',
    2253: 'Compra de energia elétrica por estabelecimento comercial',
    2254: 'Compra de energia elétrica por estabelecimento prestador de serviço de transporte',
    2255: 'Compra de energia elétrica por estabelecimento prestador de serviço de comunicação',
    2256: 'Compra de energia elétrica por estabelecimento de produtor rural',
    2257: 'Compra de energia elétrica p/ consumo por demanda contratada',
    2301: 'Aquisição de serviço de comunicação p/ execução de serviço da mesma natureza',
    2302: 'Aquisição de serviço de comunicação por estabelecimento industrial',
    2303: 'Aquisição de serviço de comunicação por estabelecimento comercial',
    2304: 'Aquisição de serviço de comunicação por estabelecimento de prestador de serviço de transporte',
    2305: 'Aquisição de serviço de comunicação por estabelecimento de geradora ou de distribuidora de energia elétrica',
    2306: 'Aquisição de serviço de comunicação por estabelecimento de produtor rural',
    2351: 'Aquisição de serviço de transporte p/ execução de serviço da mesma natureza',
    2352: 'Aquisição de serviço de transporte por estabelecimento industrial',
    2353: 'Aquisição de serviço de transporte por estabelecimento comercial',
    2354: 'Aquisição de serviço de transporte por estabelecimento de prestador de serviço de comunicação',
    2355: 'Aquisição de serviço de transporte por estabelecimento de geradora ou de distribuidora de energia elétrica',
    2356: 'Aquisição de serviço de transporte por estabelecimento de produtor rural',
    2401: 'Compra p/ industrialização ou produção rural de mercadoria sujeita a ST',
    2403: 'Compra p/ comercialização em operação com mercadoria sujeita a ST',
    2406: 'Compra de bem p/ o ativo imobilizado cuja mercadoria está sujeita a ST',
    2407: 'Compra de mercadoria p/ uso ou consumo cuja mercadoria está sujeita a ST',
    2408: 'Transferência p/ industrialização ou produção rural de mercadoria sujeita a ST',
    2409: 'Transferência p/ comercialização em operação com mercadoria sujeita a ST',
    2410: 'Devolução de venda de produção do estabelecimento, quando o produto sujeito a ST',
    2411: 'Devolução de venda de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita a ST',
    2414: 'Retorno de produção do estabelecimento, remetida p/ venda fora do estabelecimento, quando o produto sujeito a ST',
    2415: 'Retorno de mercadoria adquirida ou recebida de terceiros, remetida p/ venda fora do estabelecimento em operação com mercadoria sujeita a ST',
    2501: 'Entrada de mercadoria recebida com fim específico de exportação',
    2503: 'Entrada decorrente de devolução de produto industrializado pelo estabelecimento, remetido com fim específico de exportação',
    2504: 'Entrada decorrente de devolução de mercadoria remetida com fim específico de exportação, adquirida ou recebida de terceiros',
    2505: 'Entrada decorrente de devolução simbólica de mercadoria remetida p/ formação de lote de exportação, de produto industrializado ou produzido pelo próprio estabelecimento.',
    2506: 'Entrada decorrente de devolução simbólica de mercadoria, adquirida ou recebida de terceiros, remetida p/ formação de lote de exportação.',
    2551: 'Compra de bem p/ o ativo imobilizado',
    2552: 'Transferência de bem do ativo imobilizado',
    2553: 'Devolução de venda de bem do ativo imobilizado',
    2554: 'Retorno de bem do ativo imobilizado remetido p/ uso fora do estabelecimento',
    2555: 'Entrada de bem do ativo imobilizado de terceiro, remetido p/ uso no estabelecimento',
    2556: 'Compra de material p/ uso ou consumo',
    2557: 'Transferência de material p/ uso ou consumo',
    2603: 'Ressarcimento de ICMS retido por substituição tributária',
    2651: 'Compra de combustível ou lubrificante p/ industrialização subseqüente',
    2652: 'Compra de combustível ou lubrificante p/ comercialização',
    2653: 'Compra de combustível ou lubrificante por consumidor ou usuário final',
    2658: 'Transferência de combustível ou lubrificante p/ industrialização',
    2659: 'Transferência de combustível ou lubrificante p/ comercialização',
    2660: 'Devolução de venda de combustível ou lubrificante destinados à industrialização subseqüente',
    2661: 'Devolução de venda de combustível ou lubrificante destinados à comercialização',
    2662: 'Devolução de venda de combustível ou lubrificante destinados a consumidor ou usuário final',
    2663: 'Entrada de combustível ou lubrificante p/ armazenagem',
    2664: 'Retorno de combustível ou lubrificante remetidos p/ armazenagem',
    2901: 'Entrada p/ industrialização por encomenda',
    2902: 'Retorno de mercadoria remetida p/ industrialização por encomenda',
    2903: 'Entrada de mercadoria remetida p/ industrialização e não aplicada no referido processo',
    2904: 'Retorno de remessa p/ venda fora do estabelecimento',
    2905: 'Entrada de mercadoria recebida p/ depósito em depósito fechado ou armazém geral',
    2906: 'Retorno de mercadoria remetida p/ depósito fechado ou armazém geral',
    2907: 'Retorno simbólico de mercadoria remetida p/ depósito fechado ou armazém geral',
    2908: 'Entrada de bem por conta de contrato de comodato',
    2909: 'Retorno de bem remetido por conta de contrato de comodato',
    2910: 'Entrada de bonificação, doação ou brinde',
    2911: 'Entrada de amostra grátis',
    2912: 'Entrada de mercadoria ou bem recebido p/ demonstração',
    2913: 'Retorno de mercadoria ou bem remetido p/ demonstração',
    2914: 'Retorno de mercadoria ou bem remetido p/ exposição ou feira',
    2915: 'Entrada de mercadoria ou bem recebido p/ conserto ou reparo',
    2916: 'Retorno de mercadoria ou bem remetido p/ conserto ou reparo',
    2917: 'Entrada de mercadoria recebida em consignação mercantil ou industrial',
    2918: 'Devolução de mercadoria remetida em consignação mercantil ou industrial',
    2919: 'Devolução simbólica de mercadoria vendida ou utilizada em processo industrial, remetida anteriormente em consignação mercantil ou industrial',
    2920: 'Entrada de vasilhame ou sacaria',
    2921: 'Retorno de vasilhame ou sacaria',
    2922: 'Lançamento efetuado a título de simples faturamento decorrente de compra p/ recebimento futuro',
    2923: 'Entrada de mercadoria recebida do vendedor remetente, em venda à ordem',
    2924: 'Entrada p/ industrialização por conta e ordem do adquirente da mercadoria, quando esta não transitar pelo estabelecimento do adquirente',
    2925: 'Retorno de mercadoria remetida p/ industrialização por conta e ordem do adquirente da mercadoria, quando esta não transitar pelo estabelecimento do adquirente',
    2931: 'Lançamento efetuado pelo tomador do serviço de transporte, quando a responsabilidade de retenção do imposto for atribuída ao remetente ou alienante da mercadoria, pelo serviço de transporte realizado por transportador autônomo ou por transportador não-inscrito na UF onde se tenha iniciado o serviço',
    2932: 'Aquisição de serviço de transporte iniciado em UF diversa daquela onde esteja inscrito o prestador',
    2933: 'Aquisição de serviço tributado pelo Imposto Sobre Serviços de Qualquer Natureza',
    2934: 'Entrada simbólica de mercadoria recebida p/ depósito fechado ou armazém geral',
    2949: 'Outra entrada de mercadoria ou prestação de serviço não especificado',
    3101: 'Compra p/ industrialização ou produção rural',
    3102: 'Compra p/ comercialização',
    3126: 'Compra p/ utilização na prestação de serviço sujeita ao ICMS',
    3127: 'Compra p/ industrialização sob o regime de drawback',
    3128: 'Compra p/ utilização na prestação de serviço sujeita ao ISSQN',
    3129: 'Compra para industrialização sob o Regime Aduaneiro Especial de Entreposto Industrial (Recof-Sped)',
    3201: 'Devolução de venda de produção do estabelecimento',
    3202: 'Devolução de venda de mercadoria adquirida ou recebida de terceiros',
    3205: 'Anulação de valor relativo a aquisição de serviço de comunicação',
    3206: 'Anulação de valor relativo a aquisição de serviço de transporte',
    3207: 'Anulação de valor relativo à compra de energia elétrica',
    3211: 'Devolução de venda de produção do estabelecimento sob o regime de drawback',
    3212: 'Devolução de venda no mercado externo de mercadoria industrializada sob o Regime Aduaneiro Especial de Entreposto Industrial (Recof-Sped)',
    3251: 'Compra de energia elétrica p/ distribuição ou comercialização',
    3301: 'Aquisição de serviço de comunicação p/ execução de serviço da mesma natureza',
    3351: 'Aquisição de serviço de transporte p/ execução de serviço da mesma natureza',
    3352: 'Aquisição de serviço de transporte por estabelecimento industrial',
    3353: 'Aquisição de serviço de transporte por estabelecimento comercial',
    3354: 'Aquisição de serviço de transporte por estabelecimento de prestador de serviço de comunicação',
    3355: 'Aquisição de serviço de transporte por estabelecimento de geradora ou de distribuidora de energia elétrica',
    3356: 'Aquisição de serviço de transporte por estabelecimento de produtor rural',
    3503: 'Devolução de mercadoria exportada que tenha sido recebida com fim específico de exportação',
    3551: 'Compra de bem p/ o ativo imobilizado',
    3553: 'Devolução de venda de bem do ativo imobilizado',
    3556: 'Compra de material p/ uso ou consumo',
    3651: 'Compra de combustível ou lubrificante p/ industrialização subseqüente',
    3652: 'Compra de combustível ou lubrificante p/ comercialização',
    3653: 'Compra de combustível ou lubrificante por consumidor ou usuário final',
    3930: 'Lançamento efetuado a título de entrada de bem sob amparo de regime especial aduaneiro de admissão temporária',
    3949: 'Outra entrada de mercadoria ou prestação de serviço não especificado',
    5101: 'Venda de produção do estabelecimento',
    5102: 'Venda de mercadoria adquirida ou recebida de terceiros',
    5103: 'Venda de produção do estabelecimento efetuada fora do estabelecimento',
    5104: 'Venda de mercadoria adquirida ou recebida de terceiros, efetuada fora do estabelecimento',
    5105: 'Venda de produção do estabelecimento que não deva por ele transitar',
    5106: 'Venda de mercadoria adquirida ou recebida de terceiros, que não deva por ele transitar',
    5109: 'Venda de produção do estabelecimento destinada à ZFM ou ALC',
    5110: 'Venda de mercadoria, adquirida ou recebida de terceiros, destinada à ZFM ou ALC',
    5111: 'Venda de produção do estabelecimento remetida anteriormente em consignação industrial',
    5112: 'Venda de mercadoria adquirida ou recebida de terceiros remetida anteriormente em consignação industrial',
    5113: 'Venda de produção do estabelecimento remetida anteriormente em consignação mercantil',
    5114: 'Venda de mercadoria adquirida ou recebida de terceiros remetida anteriormente em consignação mercantil',
    5115: 'Venda de mercadoria adquirida ou recebida de terceiros, recebida anteriormente em consignação mercantil',
    5116: 'Venda de produção do estabelecimento originada de encomenda p/ entrega futura',
    5117: 'Venda de mercadoria adquirida ou recebida de terceiros, originada de encomenda p/ entrega futura',
    5118: 'Venda de produção do estabelecimento entregue ao destinatário por conta e ordem do adquirente originário, em venda à ordem',
    5119: 'Venda de mercadoria adquirida ou recebida de terceiros entregue ao destinatário por conta e ordem do adquirente originário, em venda à ordem',
    5120: 'Venda de mercadoria adquirida ou recebida de terceiros entregue ao destinatário pelo vendedor remetente, em venda à ordem',
    5122: 'Venda de produção do estabelecimento remetida p/ industrialização, por conta e ordem do adquirente, sem transitar pelo estabelecimento do adquirente',
    5123: 'Venda de mercadoria adquirida ou recebida de terceiros remetida p/ industrialização, por conta e ordem do adquirente, sem transitar pelo estabelecimento do adquirente',
    5124: 'Industrialização efetuada p/ outra empresa',
    5125: 'Industrialização efetuada p/ outra empresa quando a mercadoria recebida p/ utilização no processo de industrialização não transitar pelo estabelecimento adquirente da mercadoria',
    5129: 'Venda de insumo importado e de mercadoria industrializada sob o amparo do Regime Aduaneiro Especial de Entreposto Industrial (Recof-Sped)',
    5151: 'Transferência de produção do estabelecimento',
    5152: 'Transferência de mercadoria adquirida ou recebida de terceiros',
    5153: 'Transferência de energia elétrica',
    5155: 'Transferência de produção do estabelecimento, que não deva por ele transitar',
    5156: 'Transferência de mercadoria adquirida ou recebida de terceiros, que não deva por ele transitar',
    5201: 'Devolução de compra p/ industrialização ou produção rural',
    5202: 'Devolução de compra p/ comercialização',
    5205: 'Anulação de valor relativo a aquisição de serviço de comunicação',
    5206: 'Anulação de valor relativo a aquisição de serviço de transporte',
    5207: 'Anulação de valor relativo à compra de energia elétrica',
    5208: 'Devolução de mercadoria recebida em transferência p/ industrialização ou produção rural',
    5209: 'Devolução de mercadoria recebida em transferência p/ comercialização',
    5210: 'Devolução de compra p/ utilização na prestação de serviço',
    5251: 'Venda de energia elétrica p/ distribuição ou comercialização',
    5252: 'Venda de energia elétrica p/ estabelecimento industrial',
    5253: 'Venda de energia elétrica p/ estabelecimento comercial',
    5254: 'Venda de energia elétrica p/ estabelecimento prestador de serviço de transporte',
    5255: 'Venda de energia elétrica p/ estabelecimento prestador de serviço de comunicação',
    5256: 'Venda de energia elétrica p/ estabelecimento de produtor rural',
    5257: 'Venda de energia elétrica p/ consumo por demanda contratada',
    5258: 'Venda de energia elétrica a não contribuinte',
    5301: 'Prestação de serviço de comunicação p/ execução de serviço da mesma natureza',
    5302: 'Prestação de serviço de comunicação a estabelecimento industrial',
    5303: 'Prestação de serviço de comunicação a estabelecimento comercial',
    5304: 'Prestação de serviço de comunicação a estabelecimento de prestador de serviço de transporte',
    5305: 'Prestação de serviço de comunicação a estabelecimento de geradora ou de distribuidora de energia elétrica',
    5306: 'Prestação de serviço de comunicação a estabelecimento de produtor rural',
    5307: 'Prestação de serviço de comunicação a não contribuinte',
    5351: 'Prestação de serviço de transporte p/ execução de serviço da mesma natureza',
    5352: 'Prestação de serviço de transporte a estabelecimento industrial',
    5353: 'Prestação de serviço de transporte a estabelecimento comercial',
    5354: 'Prestação de serviço de transporte a estabelecimento de prestador de serviço de comunicação',
    5355: 'Prestação de serviço de transporte a estabelecimento de geradora ou de distribuidora de energia elétrica',
    5356: 'Prestação de serviço de transporte a estabelecimento de produtor rural',
    5357: 'Prestação de serviço de transporte a não contribuinte',
    5359: 'Prestação de serviço de transporte a contribuinte ou a não-contribuinte, quando a mercadoria transportada esteja dispensada de emissão de Nota Fiscal',
    5360: 'Prestação de serviço de transporte a contribuinte-substituto em relação ao serviço de transporte',
    5401: 'Venda de produção do estabelecimento quando o produto esteja sujeito a ST',
    5402: 'Venda de produção do estabelecimento de produto sujeito a ST, em operação entre contribuintes substitutos do mesmo produto',
    5403: 'Venda de mercadoria, adquirida ou recebida de terceiros, sujeita a ST, na condição de contribuinte-substituto',
    5405: 'Venda de mercadoria, adquirida ou recebida de terceiros, sujeita a ST, na condição de contribuinte-substituído',
    5408: 'Transferência de produção do estabelecimento quando o produto sujeito a ST',
    5409: 'Transferência de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita a ST',
    5410: 'Devolução de compra p/ industrialização de mercadoria sujeita a ST',
    5411: 'Devolução de compra p/ comercialização em operação com mercadoria sujeita a ST',
    5412: 'Devolução de bem do ativo imobilizado, em operação com mercadoria sujeita a ST',
    5413: 'Devolução de mercadoria destinada ao uso ou consumo, em operação com mercadoria sujeita a ST.',
    5414: 'Remessa de produção do estabelecimento p/ venda fora do estabelecimento, quando o produto sujeito a ST',
    5415: 'Remessa de mercadoria adquirida ou recebida de terceiros p/ venda fora do estabelecimento, em operação com mercadoria sujeita a ST',
    5451: 'Remessa de animal e de insumo p/ estabelecimento produtor',
    5501: 'Remessa de produção do estabelecimento, com fim específico de exportação',
    5502: 'Remessa de mercadoria adquirida ou recebida de terceiros, com fim específico de exportação',
    5503: 'Devolução de mercadoria recebida com fim específico de exportação',
    5504: 'Remessa de mercadoria p/ formação de lote de exportação, de produto industrializado ou produzido pelo próprio estabelecimento.',
    5505: 'Remessa de mercadoria, adquirida ou recebida de terceiros, p/ formação de lote de exportação.',
    5551: 'Venda de bem do ativo imobilizado',
    5552: 'Transferência de bem do ativo imobilizado',
    5553: 'Devolução de compra de bem p/ o ativo imobilizado',
    5554: 'Remessa de bem do ativo imobilizado p/ uso fora do estabelecimento',
    5555: 'Devolução de bem do ativo imobilizado de terceiro, recebido p/ uso no estabelecimento',
    5556: 'Devolução de compra de material de uso ou consumo',
    5557: 'Transferência de material de uso ou consumo',
    5601: 'Transferência de crédito de ICMS acumulado',
    5602: 'Transferência de saldo credor do ICMS, p/ outro estabelecimento da mesma empresa, destinado à compensação de saldo devedor do ICMS',
    5603: 'Ressarcimento de ICMS retido por substituição tributária',
    5605: 'Transferência de saldo devedor do ICMS de outro estabelecimento da mesma empresa',
    5606: 'Utilização de saldo credor do ICMS p/ extinção por compensação de débitos fiscais',
    5651: 'Venda de combustível ou lubrificante de produção do estabelecimento destinados à industrialização subseqüente',
    5652: 'Venda de combustível ou lubrificante, de produção do estabelecimento, destinados à comercialização',
    5653: 'Venda de combustível ou lubrificante, de produção do estabelecimento, destinados a consumidor ou usuário final',
    5654: 'Venda de combustível ou lubrificante, adquiridos ou recebidos de terceiros, destinados à industrialização subseqüente',
    5655: 'Venda de combustível ou lubrificante, adquiridos ou recebidos de terceiros, destinados à comercialização',
    5656: 'Venda de combustível ou lubrificante, adquiridos ou recebidos de terceiros, destinados a consumidor ou usuário final',
    5657: 'Remessa de combustível ou lubrificante, adquiridos ou recebidos de terceiros, p/ venda fora do estabelecimento',
    5658: 'Transferência de combustível ou lubrificante de produção do estabelecimento',
    5659: 'Transferência de combustível ou lubrificante adquiridos ou recebidos de terceiros',
    5660: 'Devolução de compra de combustível ou lubrificante adquiridos p/ industrialização subseqüente',
    5661: 'Devolução de compra de combustível ou lubrificante adquiridos p/ comercialização',
    5662: 'Devolução de compra de combustível ou lubrificante adquiridos por consumidor ou usuário final',
    5663: 'Remessa p/ armazenagem de combustível ou lubrificante',
    5664: 'Retorno de combustível ou lubrificante recebidos p/ armazenagem',
    5665: 'Retorno simbólico de combustível ou lubrificante recebidos p/ armazenagem',
    5666: 'Remessa, por conta e ordem de terceiros, de combustível ou lubrificante recebidos p/ armazenagem',
    5667: 'Venda de combustível ou lubrificante a consumidor ou usuário final estabelecido em outra UF',
    5901: 'Remessa p/ industrialização por encomenda',
    5902: 'Retorno de mercadoria utilizada na industrialização por encomenda',
    5903: 'Retorno de mercadoria recebida p/ industrialização e não aplicada no referido processo',
    5904: 'Remessa p/ venda fora do estabelecimento',
    5905: 'Remessa p/ depósito fechado ou armazém geral',
    5906: 'Retorno de mercadoria depositada em depósito fechado ou armazém geral',
    5907: 'Retorno simbólico de mercadoria depositada em depósito fechado ou armazém geral',
    5908: 'Remessa de bem por conta de contrato de comodato',
    5909: 'Retorno de bem recebido por conta de contrato de comodato',
    5910: 'Remessa em bonificação, doação ou brinde',
    5911: 'Remessa de amostra grátis',
    5912: 'Remessa de mercadoria ou bem p/ demonstração',
    5913: 'Retorno de mercadoria ou bem recebido p/ demonstração',
    5914: 'Remessa de mercadoria ou bem p/ exposição ou feira',
    5915: 'Remessa de mercadoria ou bem p/ conserto ou reparo',
    5916: 'Retorno de mercadoria ou bem recebido p/ conserto ou reparo',
    5917: 'Remessa de mercadoria em consignação mercantil ou industrial',
    5918: 'Devolução de mercadoria recebida em consignação mercantil ou industrial',
    5919: 'Devolução simbólica de mercadoria vendida ou utilizada em processo industrial, remetida anteriormente em consignação mercantil ou industrial',
    5920: 'Entrada de vasilhame ou sacaria',
    5921: 'Retorno de vasilhame ou sacaria',
    5922: 'Lançamento efetuado a título de simples faturamento decorrente de compra p/ recebimento futuro',
    5923: 'Entrada de mercadoria recebida do vendedor remetente, em venda à ordem',
    5924: 'Entrada p/ industrialização por conta e ordem do adquirente da mercadoria, quando esta não transitar pelo estabelecimento do adquirente',
    5925: 'Retorno de mercadoria remetida p/ industrialização por conta e ordem do adquirente da mercadoria, quando esta não transitar pelo estabelecimento do adquirente',
    5931: 'Lançamento efetuado pelo tomador do serviço de transporte, quando a responsabilidade de retenção do imposto for atribuída ao remetente ou alienante da mercadoria, pelo serviço de transporte realizado por transportador autônomo ou por transportador não-inscrito na UF onde se tenha iniciado o serviço.',
    5932: 'Prestação de serviço de transporte iniciada em UF diversa daquela onde esteja inscrito o prestador.',
    5933: 'Prestação de serviço tributado pelo Imposto sobre Serviços de Qualquer Natureza.',
    5934: 'Remessa simbólica de mercadoria para depósito fechado ou armazém geral.',
    5949: 'Outra saída de mercadoria ou prestação de serviço não especificado.',
    5926: 'Lançamento efetuado a título de reclassificação de mercadoria decorrente de formação de kit ou de sua desagregação',
    5927: 'Lançamento efetuado a título de baixa de estoque decorrente de perda, roubo ou deterioração',
    5928: 'Lançamento efetuado a título de baixa de estoque decorrente do encerramento da atividade da empresa',
    5929: 'Lançamento efetuado em decorrência de emissão de documento fiscal relativo a operação ou prestação também registrada em equipamento Emissor de Cupom Fiscal - ECF',
    6101: 'Venda de produção do estabelecimento',
    6102: 'Venda de mercadoria adquirida ou recebida de terceiros',
    6103: 'Venda de produção do estabelecimento, efetuada fora do estabelecimento',
    6104: 'Venda de mercadoria adquirida ou recebida de terceiros, efetuada fora do estabelecimento',
    6105: 'Venda de produção do estabelecimento que não deva por ele transitar',
    6106: 'Venda de mercadoria adquirida ou recebida de terceiros, que não deva por ele transitar',
    6107: 'Venda de produção do estabelecimento, destinada a não contribuinte',
    6108: 'Venda de mercadoria adquirida ou recebida de terceiros, destinada a não contribuinte',
    6109: 'Venda de produção do estabelecimento destinada à ZFM ou ALC',
    6110: 'Venda de mercadoria, adquirida ou recebida de terceiros, destinada à ZFM ou ALC',
    6111: 'Venda de produção do estabelecimento remetida anteriormente em consignação industrial',
    6112: 'Venda de mercadoria adquirida ou recebida de Terceiros remetida anteriormente em consignação industrial',
    6113: 'Venda de produção do estabelecimento remetida anteriormente em consignação mercantil',
    6114: 'Venda de mercadoria adquirida ou recebida de terceiros remetida anteriormente em consignação mercantil',
    6115: 'Venda de mercadoria adquirida ou recebida de terceiros, recebida anteriormente em consignação mercantil',
    6116: 'Venda de produção do estabelecimento originada de encomenda p/ entrega futura',
    6117: 'Venda de mercadoria adquirida ou recebida de terceiros, originada de encomenda p/ entrega futura',
    6118: 'Venda de produção do estabelecimento entregue ao destinatário por conta e ordem do adquirente originário, em venda à ordem',
    6119: 'Venda de mercadoria adquirida ou recebida de terceiros entregue ao destinatário por conta e ordem do adquirente originário, em venda à ordem',
    6120: 'Venda de mercadoria adquirida ou recebida de terceiros entregue ao destinatário pelo vendedor remetente, em venda à ordem',
    6122: 'Venda de produção do estabelecimento remetida p/ industrialização, por conta e ordem do adquirente, sem transitar pelo estabelecimento do adquirente',
    6123: 'Venda de mercadoria adquirida ou recebida de terceiros remetida p/ industrialização, por conta e ordem do adquirente, sem transitar pelo estabelecimento do adquirente',
    6124: 'Industrialização efetuada p/ outra empresa',
    6125: 'Industrialização efetuada p/ outra empresa quando a mercadoria recebida p/ utilização no processo de industrialização não transitar pelo estabelecimento adquirente da mercadoria',
    6129: 'Venda de insumo importado e de mercadoria industrializada sob o amparo do Regime Aduaneiro Especial de Entreposto Industrial (Recof-Sped)',
    6151: 'Transferência de produção do estabelecimento',
    6152: 'Transferência de mercadoria adquirida ou recebida de terceiros',
    6153: 'Transferência de energia elétrica',
    6155: 'Transferência de produção do estabelecimento, que não deva por ele transitar',
    6156: 'Transferência de mercadoria adquirida ou recebida de terceiros, que não deva por ele transitar',
    6201: 'Devolução de compra p/ industrialização ou produção rural',
    6202: 'Devolução de compra p/ comercialização',
    6205: 'Anulação de valor relativo a aquisição de serviço de comunicação',
    6206: 'Anulação de valor relativo a aquisição de serviço de transporte',
    6207: 'Anulação de valor relativo à compra de energia elétrica',
    6208: 'Devolução de mercadoria recebida em transferência p/ industrialização ou produção rural ',
    6209: 'Devolução de mercadoria recebida em transferência p/ comercialização',
    6210: 'Devolução de compra p/ utilização na prestação de serviço',
    6251: 'Venda de energia elétrica p/ distribuição ou comercialização',
    6252: 'Venda de energia elétrica p/ estabelecimento industrial',
    6253: 'Venda de energia elétrica p/ estabelecimento comercial',
    6254: 'Venda de energia elétrica p/ estabelecimento prestador de serviço de transporte',
    6255: 'Venda de energia elétrica p/ estabelecimento prestador de serviço de comunicação',
    6256: 'Venda de energia elétrica p/ estabelecimento de produtor rural',
    6257: 'Venda de energia elétrica p/ consumo por demanda contratada',
    6258: 'Venda de energia elétrica a não contribuinte',
    6301: 'Prestação de serviço de comunicação p/ execução de serviço da mesma natureza',
    6302: 'Prestação de serviço de comunicação a estabelecimento industrial',
    6303: 'Prestação de serviço de comunicação a estabelecimento comercial',
    6304: 'Prestação de serviço de comunicação a estabelecimento de prestador de serviço de transporte',
    6305: 'Prestação de serviço de comunicação a estabelecimento de geradora ou de distribuidora de energia elétrica',
    6306: 'Prestação de serviço de comunicação a estabelecimento de produtor rural',
    6307: 'Prestação de serviço de comunicação a não contribuinte',
    6351: 'Prestação de serviço de transporte p/ execução de serviço da mesma natureza',
    6352: 'Prestação de serviço de transporte a estabelecimento industrial',
    6353: 'Prestação de serviço de transporte a estabelecimento comercial',
    6354: 'Prestação de serviço de transporte a estabelecimento de prestador de serviço de comunicação',
    6355: 'Prestação de serviço de transporte a estabelecimento de geradora ou de distribuidora de energia elétrica',
    6356: 'Prestação de serviço de transporte a estabelecimento de produtor rural',
    6357: 'Prestação de serviço de transporte a não contribuinte',
    6359: 'Prestação de serviço de transporte a contribuinte ou a não-contribuinte, quando a mercadoria transportada esteja dispensada de emissão de Nota Fiscal  ',
    6360: 'Prestação de serviço de transporte a contribuinte substituto em relação ao serviço de transporte  ',
    6401: 'Venda de produção do estabelecimento quando o produto sujeito a ST',
    6402: 'Venda de produção do estabelecimento de produto sujeito a ST, em operação entre contribuintes substitutos do mesmo produto',
    6403: 'Venda de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita a ST, na condição de contribuinte substituto',
    6404: 'Venda de mercadoria sujeita a ST, cujo imposto já tenha sido retido anteriormente',
    6408: 'Transferência de produção do estabelecimento quando o produto sujeito a ST',
    6409: 'Transferência de mercadoria adquirida ou recebida de terceiros, sujeita a ST',
    6410: 'Devolução de compra p/ industrialização ou ptrodução rural quando a mercadoria sujeita a ST',
    6411: 'Devolução de compra p/ comercialização em operação com mercadoria sujeita a ST',
    6412: 'Devolução de bem do ativo imobilizado, em operação com mercadoria sujeita a ST',
    6413: 'Devolução de mercadoria destinada ao uso ou consumo, em operação com mercadoria sujeita a ST',
    6414: 'Remessa de produção do estabelecimento p/ venda fora do estabelecimento, quando o produto sujeito a ST',
    6415: 'Remessa de mercadoria adquirida ou recebida de terceiros p/ venda fora do estabelecimento, quando a referida ração com mercadoria sujeita a ST',
    6501: 'Remessa de produção do estabelecimento, com fim específico de exportação',
    6502: 'Remessa de mercadoria adquirida ou recebida de terceiros, com fim específico de exportação',
    6503: 'Devolução de mercadoria recebida com fim específico de exportação',
    6504: 'Remessa de mercadoria p/ formação de lote de exportação, de produto industrializado ou produzido pelo próprio estabelecimento.',
    6505: 'Remessa de mercadoria, adquirida ou recebida de terceiros, p/ formação de lote de exportação.',
    6551: 'Venda de bem do ativo imobilizado',
    6552: 'Transferência de bem do ativo imobilizado',
    6553: 'Devolução de compra de bem p/ o ativo imobilizado',
    6554: 'Remessa de bem do ativo imobilizado p/ uso fora do estabelecimento',
    6555: 'Devolução de bem do ativo imobilizado de terceiro, recebido p/ uso no estabelecimento',
    6556: 'Devolução de compra de material de uso ou consumo',
    6557: 'Transferência de material de uso ou consumo',
    6603: 'Ressarcimento de ICMS retido por substituição tributária',
    6651: 'Venda de combustível ou lubrificante, de produção do estabelecimento, destinados à industrialização subseqüente',
    6652: 'Venda de combustível ou lubrificante, de produção do estabelecimento, destinados à comercialização',
    6653: 'Venda de combustível ou lubrificante, de produção do estabelecimento, destinados a consumidor ou usuário final ',
    6654: 'Venda de combustível ou lubrificante, adquiridos ou recebidos de terceiros, destinados à industrialização subseqüente ',
    6655: 'Venda de combustível ou lubrificante, adquiridos ou recebidos de terceiros, destinados à comercialização',
    6656: 'Venda de combustível ou lubrificante, adquiridos ou recebidos de terceiros, destinados a consumidor ou usuário final',
    6657: 'Remessa de combustível ou lubrificante, adquiridos ou recebidos de terceiros, p/ venda fora do estabelecimento',
    6658: 'Transferência de combustível ou lubrificante de produção do estabelecimento',
    6659: 'Transferência de combustível ou lubrificante adquiridos ou recebidos de terceiros',
    6660: 'Devolução de compra de combustível ou lubrificante adquiridos p/ industrialização subseqüente',
    6661: 'Devolução de compra de combustível ou lubrificante adquiridos p/ comercialização',
    6662: 'Devolução de compra de combustível ou lubrificante adquiridos por consumidor ou usuário final',
    6663: 'Remessa p/ armazenagem de combustível ou lubrificante',
    6664: 'Retorno de combustível ou lubrificante recebidos p/ armazenagem',
    6665: 'Retorno simbólico de combustível ou lubrificante recebidos p/ armazenagem',
    6666: 'Remessa, por conta e ordem de terceiros, de combustível ou lubrificante recebidos p/ armazenagem',
    6667: 'Venda de combustível ou lubrificante a consumidor ou usuário final estabelecido em outra UF diferente da que ocorrer o consumo',
    6901: 'Remessa p/ industrialização por encomenda',
    6902: 'Retorno de mercadoria utilizada na industrialização por encomenda',
    6903: 'Retorno de mercadoria recebida p/ industrialização e não aplicada no referido processo',
    6904: 'Remessa p/ venda fora do estabelecimento',
    6905: 'Remessa p/ depósito fechado ou armazém geral',
    6906: 'Retorno de mercadoria depositada em depósito fechado ou armazém geral',
    6907: 'Retorno simbólico de mercadoria depositada em depósito fechado ou armazém geral',
    6908: 'Remessa de bem por conta de contrato de comodato',
    6909: 'Retorno de bem recebido por conta de contrato de comodato',
    6910: 'Remessa em bonificação, doação ou brinde',
    6911: 'Remessa de amostra grátis',
    6912: 'Remessa de mercadoria ou bem p/ demonstração',
    6913: 'Retorno de mercadoria ou bem recebido p/ demonstração',
    6914: 'Remessa de mercadoria ou bem p/ exposição ou feira',
    6915: 'Remessa de mercadoria ou bem p/ conserto ou reparo',
    6916: 'Retorno de mercadoria ou bem recebido p/ conserto ou reparo',
    6917: 'Remessa de mercadoria em consignação mercantil ou industrial',
    6918: 'Devolução de mercadoria recebida em consignação mercantil ou industrial',
    6919: 'Devolução simbólica de mercadoria vendida ou utilizada em processo industrial, recebida anteriormente em consignação mercantil ou industrial',
    6920: 'Remessa de vasilhame ou sacaria',
    6921: 'Devolução de vasilhame ou sacaria',
    6922: 'Lançamento efetuado a título de simples faturamento decorrente de venda p/ entrega futura',
    6923: 'Remessa de mercadoria por conta e ordem de terceiros, em venda à ordem ou em operações com armazém geral ou depósito fechado',
    6924: 'Remessa p/ industrialização por conta e ordem do adquirente da mercadoria, quando esta não transitar pelo estabelecimento do adquirente',
    6925: 'Retorno de mercadoria recebida p/ industrialização por conta e ordem do adquirente da mercadoria, quando aquela não transitar pelo estabelecimento do adquirente',
    6929: 'Lançamento efetuado em decorrência de emissão de documento fiscal relativo a operação ou prestação também registrada em equipamento Emissor de Cupom Fiscal - ECF',
    6931: 'Lançamento efetuado em decorrência da responsabilidade de retenção do imposto por substituição tributária, atribuída ao remetente ou alienante da mercadoria, pelo serviço de transporte realizado por transportador autônomo ou por transportador não inscrito na UF onde iniciado o serviço',
    6932: 'Prestação de serviço de transporte iniciada em UF diversa daquela onde inscrito o prestador',
    6933: 'Prestação de serviço tributado pelo Imposto Sobre Serviços de Qualquer Natureza ',
    6934: 'Remessa simbólica de mercadoria depositada em armazém geral ou depósito fechado',
    6949: 'Outra saída de mercadoria ou prestação de serviço não especificado',
    7101: 'Venda de produção do estabelecimento',
    7102: 'Venda de mercadoria adquirida ou recebida de terceiros',
    7105: 'Venda de produção do estabelecimento, que não deva por ele transitar',
    7106: 'Venda de mercadoria adquirida ou recebida de terceiros, que não deva por ele transitar',
    7127: 'Venda de produção do estabelecimento sob o regime de drawback ',
    7129: 'Venda de produção do estabelecimento ao mercado externo de mercadoria industrializada sob o amparo do Regime Aduaneiro Especial de Entreposto Industrial (Recof-Sped)',
    7201: 'Devolução de compra p/ industrialização ou produção rural',
    7202: 'Devolução de compra p/ comercialização',
    7205: 'Anulação de valor relativo à aquisição de serviço de comunicação',
    7206: 'Anulação de valor relativo a aquisição de serviço de transporte',
    7207: 'Anulação de valor relativo à compra de energia elétrica',
    7210: 'Devolução de compra p/ utilização na prestação de serviço',
    7211: 'Devolução de compras p/ industrialização sob o regime de drawback ',
    7212: 'Devolução de compras para industrialização sob o regime de Regime Aduaneiro Especial de Entreposto Industrial (Recof-Sped)',
    7251: 'Venda de energia elétrica p/ o exterior',
    7301: 'Prestação de serviço de comunicação p/ execução de serviço da mesma natureza',
    7358: 'Prestação de serviço de transporte',
    7501: 'Exportação de mercadorias recebidas com fim específico de exportação',
    7551: 'Venda de bem do ativo imobilizado',
    7553: 'Devolução de compra de bem p/ o ativo imobilizado',
    7556: 'Devolução de compra de material de uso ou consumo',
    7651: 'Venda de combustível ou lubrificante de produção do estabelecimento',
    7654: 'Venda de combustível ou lubrificante adquiridos ou recebidos de terceiros',
    7667: 'Venda de combustível ou lubrificante a consumidor ou usuário final',
    7930: 'Lançamento efetuado a título de devolução de bem cuja entrada tenha ocorrido sob amparo de regime especial aduaneiro de admissão temporária',
    7949: 'Outra saída de mercadoria ou prestação de serviço não especificado',
};
```

---

## `src/components/app/additional-analyses.tsx`

```tsx
"use client";

import { useState, useMemo, useEffect, type ChangeEvent, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileSearch, Sheet, Archive, AlertCircle, Loader2, Download, AlertTriangle, UploadCloud, Trash2, GitCompareArrows, Building, Save, Database } from "lucide-react";
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
    onProcessedDataChange: (data: ProcessedData | ((prevData: ProcessedData) => ProcessedData)) => void;
    onSiengeDataProcessed: (data: any[] | null) => void;
    siengeFile: File | null;
    onSiengeFileChange: (file: File | null) => void;
    onClearSiengeFile: () => void;
    allXmlFiles: File[];
    spedFiles: File[];
    onSpedFilesChange: (files: File[]) => void;
    onSpedProcessed: (spedInfo: SpedInfo | null, keyCheckResults: any | null) => void;
    competence: string | null;
    activeTab: 'imobilizado' | 'analyses';
}

export function AdditionalAnalyses({ 
    processedData, 
    onProcessedDataChange,
    onSiengeDataProcessed, 
    siengeFile, 
    onSiengeFileChange, 
    onClearSiengeFile, 
    allXmlFiles,
    spedFiles,
    onSpedFilesChange,
    onSpedProcessed,
    competence,
    activeTab
}: AdditionalAnalysesProps) {
    const { toast } = useToast();

    // Estado Inconsistências (Sienge) - Sienge Data is now passed from parent
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

    
    const { reconciliationResults, error: reconciliationError } = useMemo(() => {
        const siengeData = processedData.siengeSheetData;
        const xmlItems = processedData.sheets['Itens Válidos'];
        if (!siengeData || !xmlItems) {
            return { reconciliationResults: null, error: null };
        }
        return useReconciliation(siengeData, xmlItems);
    }, [processedData.siengeSheetData, processedData.sheets]);


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
        
        const getTaxFooter = (data: any[], taxName: string): Record<string, string> | undefined => {
            if (!data || data.length === 0) return undefined;
            const total = data.reduce((sum, row) => {
                const value = parseFloat(String(row?.[taxName] || '0').replace(',', '.'));
                return sum + (isNaN(value) ? 0 : value);
            }, 0);
            return { [taxName]: formatCurrency(total) };
        }
    
        const getCfopDescription = (cfopCode: number): string => {
            const fullDescription = cfopDescriptions[cfopCode];
            if (fullDescription) {
                 // Try to get the description again to handle nested structures, but add checks
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
                    if (localSiengeData.length === 0 || !localSiengeData[0]) return undefined;
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
    
    const handleAssetStatusChange = (assetId: string, status: 'Uso e Consumo' | 'Ativo Imobilizado') => {
        onProcessedDataChange((prevData: any) => {
            const newStatus = { ...(prevData.imobilizadoStatus || {}), [assetId]: status };
            return { ...prevData, imobilizadoStatus: newStatus };
        });
    };


    if (activeTab === 'imobilizado') {
        const imobilizados = processedData.sheets['Imobilizados'] || [];
        const imobilizadoStatus = processedData.imobilizadoStatus || {};
        
        const dataWithStatus = imobilizados.map(item => ({
            ...item,
            'Classificação': imobilizadoStatus[item.id] || 'Não Classificado'
        }));

        return (
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className='flex items-center gap-3'>
                             <Building className="h-8 w-8 text-primary" />
                             <div>
                                <CardTitle className="font-headline text-2xl">Análise de Uso, Consumo e Ativo Imobilizado</CardTitle>
                                <CardDescription>Classifique os itens. As classificações são mantidas nesta sessão.</CardDescription>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                     <DataTable
                        columns={[
                            ...getColumns(dataWithStatus.map(({ id, ...rest }) => rest)), // Hide 'id' column
                             {
                                id: 'actions',
                                header: 'Ações',
                                cell: ({ row }) => {
                                    const originalItem = imobilizados.find(item => item.id === row.original.id);
                                    if (!originalItem) return null;
                                    
                                    return (
                                        <div className="flex gap-2">
                                            <Button
                                                variant={row.original.Classificação === 'Uso e Consumo' ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => handleAssetStatusChange(originalItem.id, 'Uso e Consumo')}
                                            >
                                                Uso e Consumo
                                            </Button>
                                            <Button
                                                variant={row.original.Classificação === 'Ativo Imobilizado' ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => handleAssetStatusChange(originalItem.id, 'Ativo Imobilizado')}
                                            >
                                                Ativo Imobilizado
                                            </Button>
                                        </div>
                                    );
                                }
                            }
                        ]}
                        data={dataWithStatus}
                    />
                </CardContent>
            </Card>
        );
    }
    

    return (
        <div className="space-y-6">
             <Card>
                <CardHeader>
                     <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className='flex items-center gap-3'>
                             <FileSearch className="h-8 w-8 text-primary" />
                             <div>
                                <CardTitle className="font-headline text-2xl">Análises e Relatórios Finais</CardTitle>
                                <CardDescription>Execute análises de conciliação e exporte relatórios completos.</CardDescription>
                            </div>
                        </div>
                    </div>
                </CardHeader>
             </Card>

            <Tabs defaultValue="sped" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="sped">Verificação SPED</TabsTrigger>
                    <TabsTrigger value="reconciliation">Conciliação Itens (XML x Sienge)</TabsTrigger>
                    <TabsTrigger value="conferencias">Conferência e Revenda (Sienge)</TabsTrigger>
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
    processedData: ProcessedData;
    onSiengeFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
    onClearSiengeFile: () => void;
    reconciliationResults: { reconciled: any[], onlyInSienge: any[], onlyInXml: any[] } | null;
    error: string | null;
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
            getXmlKey: (item: any) => string | null = getSiengeKey,
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
}


function ReconciliationAnalysis({ siengeFile, onSiengeFileChange, onClearSiengeFile, processedData, reconciliationResults, error }: ReconciliationAnalysisProps) {
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
                        <CardTitle className="font-headline text-2xl">Conciliação de Itens (XML vs Sienge)</CardTitle>
                        <CardDescription>Carregue a planilha do Sienge. A comparação será executada automaticamente.</CardDescription>
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
```

---

## `src/components/app/saidas-analysis.tsx`

```tsx
"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { FileWarning, TrendingUp, XCircle, Trash2, Ban, FolderClosed, CheckCircle, Save, AlertTriangle, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";


type SaidaStatus = 'emitida' | 'cancelada' | 'inutilizada';

interface SaidaItem {
    numero: number;
    status: SaidaStatus;
    data?: any; // Original data from the sheet
    isGap?: boolean;
}

interface SaidasAnalysisProps {
    saidasData: any[];
    initialStatus: Record<number, SaidaStatus> | null;
    onStatusChange: (newStatus: Record<number, SaidaStatus>) => void;
    lastPeriodNumber: number;
    onLastPeriodNumberChange: (newNumber: number) => void;
}

export function SaidasAnalysis({ saidasData, initialStatus, onStatusChange, lastPeriodNumber, onLastPeriodNumberChange }: SaidasAnalysisProps) {
    const { toast } = useToast();
    const [statusMap, setStatusMap] = useState<Record<number, SaidaStatus>>(initialStatus || {});
    const [lastNumberInput, setLastNumberInput] = useState<string>(String(lastPeriodNumber || ''));
    const [rangeStart, setRangeStart] = useState('');
    const [rangeEnd, setRangeEnd] = useState('');


    useEffect(() => {
        setStatusMap(initialStatus || {});
    }, [initialStatus]);

    useEffect(() => {
        setLastNumberInput(String(lastPeriodNumber || ''));
    }, [lastPeriodNumber]);

    const handleSaveLastNumber = () => {
        const num = parseInt(lastNumberInput, 10);
        if (!isNaN(num)) {
            onLastPeriodNumberChange(num);
            toast({
                title: 'Número Salvo',
                description: `O número da última nota do período anterior foi salvo como ${num}.`,
            });
        } else {
            toast({
                variant: 'destructive',
                title: 'Número Inválido',
                description: 'Por favor, insira um número válido.',
            });
        }
    };
    
    const analysisResults = useMemo(() => {
        if (!saidasData || saidasData.length === 0) {
            return { sequence: [], min: 0, max: 0, firstNoteAfterGap: null };
        }

        const numericData = saidasData.map(d => ({ ...d, 'Número': parseInt(d['Número'], 10) }))
                                     .filter(d => !isNaN(d['Número']));

        if (numericData.length === 0) {
            return { sequence: [], min: 0, max: 0, firstNoteAfterGap: null };
        }

        numericData.sort((a, b) => a['Número'] - b['Número']);
        
        let min = numericData[0]['Número'];
        const max = numericData[numericData.length - 1]['Número'];

        let firstNoteAfterGap: number | null = null;
        if (lastPeriodNumber > 0 && min > lastPeriodNumber + 1) {
            firstNoteAfterGap = min;
        }

        const startSequence = lastPeriodNumber > 0 ? lastPeriodNumber + 1 : min;

        const fullSequence: SaidaItem[] = [];
        const existingNotes = new Map(numericData.map(d => [d['Número'], d]));

        for (let i = startSequence; i <= max; i++) {
            const existingNote = existingNotes.get(i);
            const savedStatus = statusMap[i];

            if (existingNote) {
                const isXmlCancelled = existingNote['Status']?.toLowerCase() === 'canceladas';
                const finalStatus = savedStatus || (isXmlCancelled ? 'cancelada' : 'emitida');
                fullSequence.push({ numero: i, status: finalStatus, data: existingNote });
            } else {
                fullSequence.push({ numero: i, status: savedStatus || 'inutilizada', isGap: true });
            }
        }
        
        return { sequence: fullSequence, min, max, firstNoteAfterGap };
    }, [saidasData, statusMap, lastPeriodNumber]);

    const handleStatusChange = (numero: number, newStatus: SaidaStatus) => {
        const newStatusMap = { ...statusMap, [numero]: newStatus };
        setStatusMap(newStatusMap);
        onStatusChange(newStatusMap); // Notify parent
        toast({
            title: 'Status Alterado',
            description: `A nota número ${numero} foi marcada como ${newStatus}. O estado será guardado.`,
        });
    };

    const handleClearStatus = () => {
        setStatusMap({});
        onStatusChange({}); // Notify parent
        toast({
            title: 'Classificações Limpas',
            description: 'Todos os status manuais das notas de saída foram removidos.',
        });
    };
    
    const handleMarkRangeAsUnused = () => {
        const start = parseInt(rangeStart, 10);
        const end = parseInt(rangeEnd, 10);

        if (isNaN(start) || isNaN(end) || start <= 0 || end <= 0) {
            toast({ variant: 'destructive', title: 'Intervalo Inválido', description: 'Por favor, insira números de início e fim válidos.' });
            return;
        }
        if (start > end) {
            toast({ variant: 'destructive', title: 'Intervalo Inválido', description: 'O número inicial deve ser menor ou igual ao final.' });
            return;
        }

        const newStatusMap = { ...statusMap };
        let count = 0;
        for (let i = start; i <= end; i++) {
            newStatusMap[i] = 'inutilizada';
            count++;
        }

        setStatusMap(newStatusMap);
        onStatusChange(newStatusMap);

        toast({
            title: 'Intervalo Marcado como Inutilizado',
            description: `${count} notas de ${start} a ${end} foram marcadas.`
        });
        setRangeStart('');
        setRangeEnd('');
    };

    const getStatusVariant = (status: SaidaStatus): "default" | "destructive" | "secondary" => {
        switch (status) {
            case 'emitida': return 'default';
            case 'cancelada': return 'destructive';
            case 'inutilizada': return 'secondary';
        }
    };
    
    const getStatusIcon = (item: SaidaItem) => {
        if (item.status === 'inutilizada' && item.isGap) {
            return <FileWarning className="h-5 w-5 text-yellow-600" />;
        }
        switch (item.status) {
            case 'emitida': return <CheckCircle className="h-5 w-5 text-green-600" />;
            case 'cancelada': return <XCircle className="h-5 w-5 text-red-600" />;
            case 'inutilizada': return <Ban className="h-5 w-5 text-slate-600" />;
        }
    };
    
    const getStatusText = (item: SaidaItem): string => {
        if (item.status === 'inutilizada' && item.isGap) {
            return 'Intervalo';
        }
        return item.status.charAt(0).toUpperCase() + item.status.slice(1);
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex items-center gap-3">
                         <TrendingUp className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="font-headline text-2xl">Análise de Sequência de Notas de Saída</CardTitle>
                            <CardDescription>
                                Verifique a sequência numérica das notas fiscais de saída para identificar falhas.
                                {analysisResults.sequence.length > 0 && ` Analisando do número ${analysisResults.sequence[0].numero} ao ${analysisResults.sequence[analysisResults.sequence.length - 1].numero}.`}
                            </CardDescription>
                        </div>
                    </div>
                     <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                        <Button onClick={handleClearStatus} variant="destructive" size="sm">
                            <Trash2 className="mr-2 h-4 w-4" />
                            Limpar Status
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <Card className="bg-muted/50">
                        <CardHeader className='pb-2'>
                            <CardTitle className='text-lg'>Período Anterior</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center gap-2">
                                <Label htmlFor="last-note-input" className="whitespace-nowrap text-sm font-medium">Última NF do Período:</Label>
                                <Input
                                    id="last-note-input"
                                    type="number"
                                    value={lastNumberInput}
                                    onChange={(e) => setLastNumberInput(e.target.value)}
                                    className="w-32"
                                    placeholder="Ex: 11498"
                                />
                                <Button onClick={handleSaveLastNumber} size="sm"><Save className="mr-2 h-4 w-4"/> Guardar</Button>
                            </div>
                        </CardContent>
                    </Card>
                     <Card className="bg-muted/50">
                        <CardHeader className='pb-2'>
                            <CardTitle className='text-lg'>Marcar Intervalo Inutilizado</CardTitle>
                        </CardHeader>
                        <CardContent>
                             <div className="flex items-center gap-2">
                                <Label htmlFor="range-start-input" className="text-sm font-medium">De:</Label>
                                <Input
                                    id="range-start-input"
                                    type="number"
                                    value={rangeStart}
                                    onChange={(e) => setRangeStart(e.target.value)}
                                    className="w-28"
                                    placeholder="Início"
                                />
                                 <Label htmlFor="range-end-input" className="text-sm font-medium">Até:</Label>
                                 <Input
                                    id="range-end-input"
                                    type="number"
                                    value={rangeEnd}
                                    onChange={(e) => setRangeEnd(e.target.value)}
                                    className="w-28"
                                    placeholder="Fim"
                                />
                                <Button onClick={handleMarkRangeAsUnused} size="sm" variant="secondary"><Ban className="mr-2 h-4 w-4"/> Marcar</Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>


                {analysisResults.firstNoteAfterGap && (
                    <Alert variant="destructive" className="mb-4">
                        <AlertTriangle className="h-4 w-4" />
                        <CardTitle>Alerta de Falha na Sequência</CardTitle>
                        <AlertDescription>
                            A última nota do período anterior foi <strong>{lastPeriodNumber}</strong>, mas a primeira nota deste período é <strong>{analysisResults.firstNoteAfterGap}</strong>. Verifique as notas em falta no intervalo.
                        </AlertDescription>
                    </Alert>
                )}

                {analysisResults.sequence.length > 0 ? (
                    <div className="overflow-x-auto rounded-lg border">
                        <TooltipProvider>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[120px]">Número</TableHead>
                                        <TableHead className="w-[150px]">Status</TableHead>
                                        <TableHead>Destinatário</TableHead>
                                        <TableHead>Data de Emissão</TableHead>
                                        <TableHead className="text-right">Valor</TableHead>
                                        <TableHead className="w-[150px] text-center">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {analysisResults.sequence.map((item) => (
                                        <TableRow key={item.numero} className={item.isGap ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}>
                                            <TableCell className="font-medium">{item.numero}</TableCell>
                                            <TableCell>
                                                <Badge variant={getStatusVariant(item.status)} className="flex items-center gap-2">
                                                    {getStatusIcon(item)}
                                                    <span className="capitalize">{getStatusText(item)}</span>
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{item.data?.['Destinatário'] || '---'}</TableCell>
                                            <TableCell>
                                                {item.data?.['Emissão'] ? format(new Date(item.data['Emissão']), 'dd/MM/yyyy HH:mm') : '---'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {typeof item.data?.['Total'] === 'number' ? item.data['Total'].toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '---'}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    {item.status !== 'cancelada' && (
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStatusChange(item.numero, 'cancelada')}>
                                                                    <XCircle className="h-4 w-4" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p>Marcar Cancelada</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    )}
                                                    {item.status !== 'inutilizada' && (
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStatusChange(item.numero, 'inutilizada')}>
                                                                    <Ban className="h-4 w-4" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p>Marcar Inutilizada</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    )}
                                                    {item.status !== 'emitida' && !item.isGap && (
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleStatusChange(item.numero, 'emitida')}>
                                                                    <RotateCcw className="h-4 w-4" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p>Reverter para Emitida</p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TooltipProvider>
                    </div>
                ) : (
                    <div className="p-8 text-center text-muted-foreground"><FolderClosed className="mx-auto h-12 w-12 mb-4" /><h3 className="text-xl font-semibold mb-2">Nenhum dado de saída</h3><p>Os dados de notas de saída da primeira etapa aparecerão aqui para análise.</p></div>
                )}
            </CardContent>
        </Card>
    );
}
```

---

## `src/components/app/nfse-analysis.tsx`

```tsx
"use client";

import { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/app/data-table";
import { getColumns } from "@/lib/columns-helper";
import { FileSearch, Loader2, Download, FilePieChart, AlertTriangle, FilterX, X, RotateCcw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
    'Soma Item de Serviço 702': number;
    'Soma Item de Serviço 703': number;
    'Susp. (Item 702)': number;
    'Susp. (Item 703)': number;
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
// Helper Functions
// ===============================================================
const parseCurrency = (value: string | null | undefined): number => {
    if (!value) return 0;
    return parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0;
};

const suspensionPhrases = [
    "suspensao da exigibilidade", "suspensao da exigencia", "suspensao da contribuicao"
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
    
    const analysisResults = useMemo((): AnalysisResults | null => {
        if (allExtractedData.length === 0) return null;

        const filteredData = allExtractedData.filter(d => !disregardedNotes.has(d.numero_nfse));

        const detailedData: DetailedData = {
            all: filteredData, service702: [], service703: [],
            susp702: [], susp703: [], pending: [],
            retention: { iss: [], ir: [], inss: [], csll: [], pis: [], cofins: [] }
        };

        const financialSummary: FinancialSummary = {
            'Soma Total das Notas': 0, 'Total de Notas (únicas)': new Set(filteredData.map(d => d.numero_nfse)).size,
            'Soma Item de Serviço 702': 0, 'Soma Item de Serviço 703': 0,
            'Susp. (Item 702)': 0, 'Susp. (Item 703)': 0,
        };
        const retentionSummary: RetentionSummary = {
            'Retenção ISS': 0, 'Retenção IR': 0, 'Retenção INSS': 0,
            'Retenção CSLL': 0, 'Retenção PIS': 0, 'Retenção COFINS': 0
        };
        const pendingNotes: NfseData[] = [];

        for (const nf of filteredData) {
            financialSummary['Soma Total das Notas'] += nf.valor_total;
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
                financialSummary['Soma Item de Serviço 702'] += nf.valor_total;
                detailedData.service702.push(nf);
            } else if (serviceCode === '703') {
                financialSummary['Soma Item de Serviço 703'] += nf.valor_total;
                detailedData.service703.push(nf);
            }

            const normalizedDescritivo = normalizeText(nf.descritivo);
            const hasExactSuspensionPhrase = suspensionPhrases.some(phrase => normalizedDescritivo.includes(phrase));
            
            if (hasExactSuspensionPhrase) {
                 if (serviceCode === '702') {
                    financialSummary['Susp. (Item 702)'] += nf.valor_total;
                    detailedData.susp702.push(nf);
                } else if (serviceCode === '703') {
                    financialSummary['Susp. (Item 703)'] += nf.valor_total;
                    detailedData.susp703.push(nf);
                }
            } else if (normalizedDescritivo.includes('suspensao')) {
                 pendingNotes.push(nf);
                 detailedData.pending.push(nf);
            }
        }
        return { financialSummary, retentionSummary, pendingNotes, detailedData };
    }, [allExtractedData, disregardedNotes]);

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
                                    As seguintes notas contêm a palavra "suspensão", mas não uma das frases específicas de exigibilidade, e requerem verificação manual:
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
                        <CardTitle className="flex items-center gap-2 text-lg"><FilterX /> Desconsiderar Notas</CardTitle>
                         <CardDescription>Digite o número da nota e clique no botão para a desconsiderar da análise. Os totais serão recalculados.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex gap-4 items-end">
                            <div className="flex-grow">
                                <Label htmlFor="disregarded-notes-input">Número da NFS-e</Label>
                                <Input
                                    id="disregarded-notes-input"
                                    placeholder="Ex: 3673"
                                    value={noteInput}
                                    onChange={(e) => setNoteInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleDisregardNote()}
                                />
                            </div>
                            <Button onClick={handleDisregardNote}>Desconsiderar Nota</Button>
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
                {renderContent()}
            </CardContent>
        </Card>
    );
}
```

---

## `src/components/app/key-checker.tsx`

```tsx
"use client";

import { useState, useCallback, type ChangeEvent, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { KeyRound, FileText, Loader2, Download, FileWarning, UploadCloud, Terminal, Search, Trash2, Copy, ShieldCheck, HelpCircle, X, FileUp, Upload } from "lucide-react";
import { KeyResultsDisplay } from "@/components/app/key-results-display";
import { LogDisplay } from "@/components/app/log-display";
import { formatCnpj, cleanAndToStr, parseSpedDate } from "@/lib/utils";
import type { SpedKeyObject, SpedInfo } from "@/lib/excel-processor";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";


// Types
export type KeyInfo = {
    key: string;
    type: 'Entrada' | 'Saída' | 'N/A' | 'CTE' | 'NFE';
    Fornecedor?: string;
    Emissão?: string | Date;
    Total?: number;
    // Campos adicionais para verificação
    destIE?: string;
    destUF?: string;
    destCNPJ?: string;
    emitCNPJ?: string;
    emitName?: string;
    emitIE?: string;
    [key: string]: any;
};

export type ConsolidatedDivergence = {
    'Tipo': 'NFE' | 'CTE';
    'Chave de Acesso': string;
    'Data Emissão XML': string;
    'Data Emissão SPED': string;
    'Data Entrada/Saída SPED': string;
    'Valor XML': number;
    'Valor SPED': number;
    'UF no XML': string;
    'IE no XML': string;
    'Resumo das Divergências': string;
};

export type DateValueDivergence = {
    'Tipo': 'NFE' | 'CTE';
    'Chave de Acesso': string;
    'Data Emissão XML'?: string;
    'Data Emissão SPED'?: string;
    'Data Entrada/Saída SPED'?: string;
    'Valor XML'?: number;
    'Valor SPED'?: number;
};

export type IEUFDivergence = {
    'Tipo': 'NFE' | 'CTE';
    'Chave de Acesso': string;
    'CNPJ do Emissor': string;
    'Nome do Emissor': string;
    'UF no XML'?: string;
    'IE no XML'?: string;
};

export type KeyCheckResult = {
    keysNotFoundInTxt: KeyInfo[];
    keysInTxtNotInSheet: KeyInfo[];
    duplicateKeysInSheet: string[];
    duplicateKeysInTxt: string[];
    validKeys: KeyInfo[];
    dateDivergences: DateValueDivergence[];
    valueDivergences: DateValueDivergence[];
    ufDivergences: IEUFDivergence[];
    ieDivergences: IEUFDivergence[];
    consolidatedDivergences: ConsolidatedDivergence[];
};

type ModificationLog = {
    lineNumber: number;
    original: string;
    corrected: string;
};

type RemovedLineLog = {
    lineNumber: number;
    line: string;
};


interface SpedCorrectionResult {
    fileName: string;
    fileContent?: string;
    error?: string;
    linesRead: number;
    linesModified: number;
    modifications: {
        truncation: ModificationLog[];
        unitStandardization: ModificationLog[];
        removed0190: RemovedLineLog[];
        addressSpaces: ModificationLog[];
        ieCorrection: ModificationLog[];
        cteSeriesCorrection: ModificationLog[];
        count9900: ModificationLog[];
        blockCount: ModificationLog[];
        totalLineCount: ModificationLog[];
    };
    log: string[];
}

const GRANTEL_CNPJ = "81732042000119";
const GRANTEL_IE = "9015130668";
const GRANTEL_UF = "PR";


// =================================================================
// HELPER: File reader with encoding fallback
// =================================================================
const readFileAsTextWithEncoding = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target && event.target.result instanceof ArrayBuffer) {
                const buffer = event.target.result;
                // Try UTF-8 first
                const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
                try {
                    const text = utf8Decoder.decode(buffer);
                    // Check for replacement characters, which indicate an encoding error
                    if (text.includes('')) {
                        throw new Error("UTF-8 decoding resulted in replacement characters.");
                    }
                    resolve(text);
                } catch (e) {
                    // If UTF-8 fails, fallback to ISO-8859-1
                    const isoDecoder = new TextDecoder('iso-8859-1');
                    resolve(isoDecoder.decode(buffer));
                }
            } else {
                reject(new Error('Failed to read file as ArrayBuffer.'));
            }
        };
        reader.onerror = () => reject(new Error(`Error reading file: ${file.name}`));
        reader.readAsArrayBuffer(file);
    });
};

const processSpedFileInBrowser = (spedFileContent: string, nfeData: any[], cteData: any[]): SpedCorrectionResult => {
    const log: string[] = [];
    const modifications: SpedCorrectionResult['modifications'] = {
        truncation: [],
        unitStandardization: [],
        removed0190: [],
        addressSpaces: [],
        ieCorrection: [],
        cteSeriesCorrection: [],
        count9900: [],
        blockCount: [],
        totalLineCount: [],
    };
    const _log = (message: string) => log.push(`[${new Date().toLocaleTimeString()}] ${message}`);

    _log(`Iniciando processamento do arquivo no navegador.`);

    const cnpjToIeMap = new Map<string, string>();
    if (nfeData && nfeData.length > 0) {
        nfeData.forEach(nota => {
            const cnpj = cleanAndToStr(nota.emitCNPJ || nota['CPF/CNPJ do Fornecedor']);
            const ie = cleanAndToStr(nota.emitIE); // IE do emitente
            if (cnpj && ie && !cnpjToIeMap.has(cnpj)) {
               cnpjToIeMap.set(cnpj, ie);
            }
        });
         _log(`Mapa de referência CNPJ x IE (NF-e) criado com ${cnpjToIeMap.size} entradas.`);
    } else {
        _log("AVISO: Dados de 'Notas Válidas' não disponíveis. A correção de IE para NF-e não será executada.");
    }
    
    const cteKeyToSeriesMap = new Map<string, string>();
    if (cteData && cteData.length > 0) {
        cteData.forEach(cte => {
            const key = cleanAndToStr(cte['Chave de acesso']);
            const series = cleanAndToStr(cte['Série']);
            if (key && series && !cteKeyToSeriesMap.has(key)) {
                cteKeyToSeriesMap.set(key, series);
            }
        });
        _log(`Mapa de referência Chave CT-e x Série criado com ${cteKeyToSeriesMap.size} entradas.`);
    } else {
         _log("AVISO: Dados de 'CTEs Válidos' não disponíveis. A correção de Série para CT-e não será executada.");
    }


    const lines = spedFileContent.split(/\r?\n/);
    let modifiedLines: string[] = [];
    let linesModifiedCount = 0;

    const TRUNCATION_CODES = new Set(['0450', '0460', 'C110']);
    const MAX_CHARS_TRUNCATION = 235;
    const UNIT_FIELD_CONFIG: Record<string, number> = { '0200': 6, 'C170': 6 };
    
    // Step 1: Initial filtering and modifications
    for (let i = 0; i < lines.length; i++) {
        let originalLine = lines[i];
        if (!originalLine) continue; // Skip empty lines
        
        const parts = originalLine.split('|');
        const codeType = parts[1];

        // Rule: Remove all 0190 records except for specific ones.
        if (codeType === '0190') {
            const lineToKeep1 = '|0190|un|Unidade|';
            const lineToKeep2 = '|0190|pc|Peça|';
            const trimmedLine = originalLine.trim();

            if (trimmedLine !== lineToKeep1 && trimmedLine !== lineToKeep2) {
                modifications.removed0190.push({ lineNumber: i + 1, line: originalLine });
                if (!modifications.removed0190.find(log => log.line === originalLine)) {
                    linesModifiedCount++;
                }
                continue; // Do not add this line to modifiedLines
            }
        }
        
        let currentLine = originalLine;
        let lineWasModified = false;
        
        // Rule: IE Correction (for 0150 records)
        if (codeType === '0150' && parts.length > 7 && cnpjToIeMap.size > 0) {
            const cnpj = cleanAndToStr(parts[5]);
            const spedIE = cleanAndToStr(parts[7]);
            const correctIE = cnpjToIeMap.get(cnpj);
            if (correctIE && spedIE !== correctIE) {
                parts[7] = correctIE;
                currentLine = parts.join('|');
                modifications.ieCorrection.push({ lineNumber: i + 1, original: originalLine, corrected: currentLine });
                lineWasModified = true;
            }
        }

        // Rule: CT-e Series Correction (for D100 records)
        if (codeType === 'D100' && parts.length > 10 && cteKeyToSeriesMap.size > 0) {
            const cteKey = cleanAndToStr(parts[10]);
            const correctSeries = cteKeyToSeriesMap.get(cteKey);
            if (correctSeries) {
                const formattedSeries = correctSeries.padStart(3, '0');
                if (parts[7] !== formattedSeries) {
                    parts[7] = formattedSeries;
                    currentLine = parts.join('|');
                    modifications.cteSeriesCorrection.push({ lineNumber: i + 1, original: originalLine, corrected: currentLine });
                    lineWasModified = true;
                }
            }
        }
        
        // Rule: Address Space
        if (codeType === '0150' && parts.length > 12) {
            const addressComplement = parts[12] || '';
            if (/\s{2,}/.test(addressComplement)) {
                parts[12] = addressComplement.replace(/\s+/g, ' ').trim();
                currentLine = parts.join('|');
                modifications.addressSpaces.push({ lineNumber: i + 1, original: originalLine, corrected: currentLine });
                lineWasModified = true;
            }
        }

        // Rule: Unit Standardization (Anything that is not 'un' becomes 'un')
        if (codeType) {
            const unitFieldIndex = UNIT_FIELD_CONFIG[codeType];
            if (unitFieldIndex && parts.length > unitFieldIndex) {
                const currentUnit = (parts[unitFieldIndex] || '').trim().toLowerCase();
                if (currentUnit && currentUnit !== 'un') {
                    parts[unitFieldIndex] = 'un';
                    currentLine = parts.join('|');
                    modifications.unitStandardization.push({ lineNumber: i + 1, original: originalLine, corrected: currentLine });
                    lineWasModified = true;
                }
            }
        }

        // Rule: Truncation
        if (codeType && TRUNCATION_CODES.has(codeType)) {
            const lastPipeIndex = currentLine.lastIndexOf('|');
            const secondLastPipeIndex = currentLine.lastIndexOf('|', lastPipeIndex - 1);
            if (lastPipeIndex > secondLastPipeIndex && secondLastPipeIndex > -1) {
                const content = currentLine.substring(secondLastPipeIndex + 1, lastPipeIndex);
                if (content.length > MAX_CHARS_TRUNCATION) {
                    const truncatedContent = content.substring(0, MAX_CHARS_TRUNCATION).trimEnd();
                    currentLine = currentLine.substring(0, secondLastPipeIndex + 1) + truncatedContent + currentLine.substring(lastPipeIndex);
                    modifications.truncation.push({ lineNumber: i + 1, original: originalLine, corrected: currentLine });
                    lineWasModified = true;
                }
            }
        }
        
        if (lineWasModified && originalLine !== currentLine) {
            if (!modifications.truncation.find(log => log.original === originalLine) &&
                !modifications.unitStandardization.find(log => log.original === originalLine) &&
                !modifications.addressSpaces.find(log => log.original === originalLine) &&
                !modifications.ieCorrection.find(log => log.original === originalLine) &&
                !modifications.cteSeriesCorrection.find(log => log.original === originalLine)
            ) {
                 linesModifiedCount++;
            }
        }

        modifiedLines.push(currentLine);
    }
    
    // Step 2: Recalculate counters
    _log("Iniciando a recontagem de linhas dos blocos (registros x990) e total (9999).");
    const blockCounters: { [block: string]: { startIndex: number, counterIndex?: number } } = {};
    let finalLineCounterIndex = -1;
    let count0190 = 0;
    let count9900For0190Index = -1;

    modifiedLines.forEach((line, index) => {
        if (!line) return;
        const parts = line.split('|');
        if (parts.length < 2) return;

        const reg = parts[1];
        if(!reg) return;

        if (reg === '0190') {
            count0190++;
        }

        if (reg === '9900' && parts[2] === '0190') {
            count9900For0190Index = index;
        }

        // Block openers start with a letter/number and end with '001'
        if (reg.match(/^[A-Z0-9]001$/)) {
            const block = reg.charAt(0);
            if (!blockCounters[block]) {
                blockCounters[block] = { startIndex: index };
            }
        } else if (reg.endsWith('990') && reg !== '9990') { // Block closers
            const block = reg.charAt(0);
            if (blockCounters[block]) {
                blockCounters[block].counterIndex = index;
            }
        } else if (reg === '9999') {
            finalLineCounterIndex = index;
        }
    });
    
    // Correct 9900 for 0190
    if (count9900For0190Index !== -1) {
        const originalLine = modifiedLines[count9900For0190Index];
        const parts = originalLine.split('|');
        if (parts.length > 3 && parseInt(parts[3], 10) !== count0190) {
            const oldVal = parts[3];
            parts[3] = String(count0190);
            const correctedLine = parts.join('|');
            modifiedLines[count9900For0190Index] = correctedLine;
            modifications.count9900.push({
                lineNumber: count9900For0190Index + 1,
                original: `Contador |9900|0190|: ${oldVal}`,
                corrected: `Contador |9900|0190| corrigido para: ${count0190}`
            });
            linesModifiedCount++;
        }
    }


    for (const block in blockCounters) {
        const blockInfo = blockCounters[block];
        if (blockInfo.counterIndex !== undefined) {
            const originalLine = modifiedLines[blockInfo.counterIndex];
            const originalParts = originalLine.split('|');
            // The number of lines in a block is the difference in index + 1
            const expectedCount = blockInfo.counterIndex - blockInfo.startIndex + 1;

            if (originalParts.length > 2 && parseInt(originalParts[2], 10) !== expectedCount) {
                const oldVal = originalParts[2];
                originalParts[2] = String(expectedCount);
                const correctedLine = originalParts.join('|');
                modifiedLines[blockInfo.counterIndex] = correctedLine;
                
                const modificationKey = `block-${block}`;
                if (!modifications.blockCount.some(m => m.original.includes(modificationKey))) {
                    modifications.blockCount.push({
                        lineNumber: blockInfo.counterIndex + 1,
                        original: `Contador Bloco |${block}990|: ${oldVal}`,
                        corrected: `Contador Bloco |${block}990| corrigido para: ${expectedCount}`
                    });
                    linesModifiedCount++;
                }
            }
        }
    }

    if (finalLineCounterIndex !== -1) {
        const totalLines = modifiedLines.length;
        const originalLine = modifiedLines[finalLineCounterIndex];
        const originalParts = originalLine.split('|');

        if (originalParts.length > 2 && parseInt(originalParts[2], 10) !== totalLines) {
            const oldVal = originalParts[2];
            originalParts[2] = String(totalLines);
            const correctedLine = originalParts.join('|');
            modifiedLines[finalLineCounterIndex] = correctedLine;

            modifications.totalLineCount.push({
                lineNumber: finalLineCounterIndex + 1,
                original: `Contador Total |9999|: ${oldVal}`,
                corrected: `Contador Total |9999| corrigido para: ${totalLines}`
            });
            linesModifiedCount++;
        }
    }


     if (modifications.blockCount.length > 0 || modifications.totalLineCount.length > 0) {
        _log(`Recontagem de linhas concluída.`);
    }

    _log(`Processamento concluído. Total de linhas lidas: ${lines.length}. Total de linhas com modificações: ${linesModifiedCount}.`);

    return {
        fileName: `corrigido_sped.txt`,
        fileContent: modifiedLines.join('\r\n') + '\r\n',
        linesRead: lines.length,
        linesModified: linesModifiedCount,
        modifications,
        log
    };
};

// Main Component
interface KeyCheckerProps {
    chavesValidas: any[];
    spedFiles: File[];
    onFilesChange: (files: File[]) => void;
    onSpedProcessed: (spedInfo: SpedInfo | null, keyCheckResults: KeyCheckResult | null) => void;
    initialSpedInfo: SpedInfo | null;
    initialKeyCheckResults: KeyCheckResult | null;
    nfeEntradaData: any[]; // Pass NFe data for IE correction
    cteData: any[]; // Pass CTe data for series correction
}

export function KeyChecker({ 
    chavesValidas, 
    spedFiles, 
    onFilesChange, 
    onSpedProcessed, 
    initialSpedInfo, 
    initialKeyCheckResults, 
    nfeEntradaData,
    cteData
}: KeyCheckerProps) {
    const [results, setResults] = useState<KeyCheckResult | null>(initialKeyCheckResults);
    const [spedInfo, setSpedInfo] = useState<SpedInfo | null>(initialSpedInfo);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const { toast } = useToast();
    const [correctionResult, setCorrectionResult] = useState<SpedCorrectionResult | null>(null);
    const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
    const [isCorrecting, setIsCorrecting] = useState(false);
    
    useEffect(() => {
        setResults(initialKeyCheckResults);
    }, [initialKeyCheckResults]);

    useEffect(() => {
        setSpedInfo(initialSpedInfo);
    }, [initialSpedInfo]);


    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const newFiles = e.target.files ? Array.from(e.target.files) : [];
        if (newFiles.length > 0) {
            onFilesChange([...spedFiles, ...newFiles]);
            toast({ title: "Arquivo(s) selecionado(s)", description: `${newFiles.length} arquivo(s) SPED adicionado(s).` });
        }
    };
    
    const removeSpedFile = (fileToRemove: File) => {
        onFilesChange(spedFiles.filter(f => f !== fileToRemove));
    };

    const checkSpedKeysInBrowser = useCallback(async (spedFileContents: string[], logFn: (message: string) => void): Promise<{
        keyCheckResults?: KeyCheckResult;
        spedInfo?: SpedInfo | null;
        allSpedKeys?: SpedKeyObject[];
        error?: string;
    }> => {
        logFn("Iniciando verificação de chaves SPED no navegador.");

        if (!chavesValidas || chavesValidas.length === 0) {
            throw new Error("Dados de 'Chaves Válidas' não encontrados. Execute a Validação NF-Stock primeiro.");
        }
        
        logFn(`${chavesValidas.length} 'Chaves Válidas' carregadas.`);
        const chavesValidasMap = new Map<string, any>(chavesValidas.map(item => [cleanAndToStr(item['Chave de acesso']), item]));
        logFn(`${chavesValidasMap.size} chaves únicas da planilha mapeadas.`);

        const findDuplicates = (arr: any[], keyAccessor: (item: any) => string): string[] => {
            const seen = new Set<string>();
            const duplicates = new Set<string>();
            arr.forEach(item => {
                const key = keyAccessor(item);
                if (seen.has(key)) duplicates.add(key); else seen.add(key);
            });
            return Array.from(duplicates);
        };
        const duplicateKeysInSheet = findDuplicates(chavesValidas, item => item['Chave de acesso']);

        logFn("Processando arquivo SPED para extrair chaves, datas, valores e participantes...");
        
        const spedDocData = new Map<string, any>();
        const participantData = new Map<string, any>();
        const allTxtKeysForDuplicateCheck: string[] = [];
        let currentSpedInfo: SpedInfo | null = null;
        
        const parseSpedInfo = (spedLine: string): SpedInfo | null => {    
            if (!spedLine || !spedLine.startsWith('|0000|')) return null;
            const parts = spedLine.split('|');
            if (parts.length < 10) return null;
            const startDate = parts[4], companyName = parts[6], cnpj = parts[7];
            if (!startDate || !companyName || !cnpj || startDate.length !== 8) return null;
            const month = startDate.substring(2, 4), year = startDate.substring(4, 8);
            const competence = `${month}/${year}`;
            return { cnpj, companyName, competence };
        };

        for (const content of spedFileContents) {
            const lines = content.split(/\r?\n/);
            for (const line of lines) {
                const parts = line.split('|');
                if (parts.length < 2) continue;
                const reg = parts[1];

                if (reg === '0000' && !currentSpedInfo) currentSpedInfo = parseSpedInfo(line);

                if (reg === '0150') {
                    const codPart = parts[2];
                    if (codPart) participantData.set(codPart, { nome: parts[3], cnpj: parts[5], ie: parts[7], uf: parts[9] });
                    continue;
                }

                let key: string | undefined, docData: any;
                // NF-e (C100)
                if (reg === 'C100' && parts.length > 9 && parts[9]?.length === 44) {
                    key = parts[9];
                    docData = { key, reg, indOper: parts[2], codPart: parts[4], dtDoc: parts[10], dtES: parts[11], vlDoc: parts[12], vlDesc: parts[14] };
                // CT-e (D100)
                } else if (reg === 'D100' && parts.length > 11 && parts[10]?.length === 44) {
                    key = parts[10];
                     docData = { key, reg, indOper: parts[2], codPart: parts[4], dtDoc: parts[8], dtES: parts[9], vlDoc: parts[16] };
                }

                if (key && docData) {
                    spedDocData.set(key, docData);
                    allTxtKeysForDuplicateCheck.push(key);
                }
            }
        }

        if(currentSpedInfo) logFn(`Informações do SPED: CNPJ ${currentSpedInfo.cnpj}, Empresa ${currentSpedInfo.companyName}, Competência ${currentSpedInfo.competence}.`);
        logFn(`${spedDocData.size} documentos (NFe/CTe) únicos encontrados no SPED.`);
        logFn(`${participantData.size} participantes (0150) encontrados.`);

        const duplicateKeysInTxt = findDuplicates(allTxtKeysForDuplicateCheck, key => key);

        logFn("Comparando chaves...");
        const keysNotFoundInTxt = [...chavesValidasMap.values()]
            .filter(item => !spedDocData.has(item['Chave de acesso']))
            .map(item => ({ ...item, key: item['Chave de acesso'], type: item['Tipo'] || 'N/A' }));

        const keysInTxtNotInSheet = [...spedDocData.values()]
            .filter(spedDoc => !chavesValidasMap.has(spedDoc.key))
            .map(spedDoc => {
                 const participant = spedDoc.codPart ? participantData.get(spedDoc.codPart) : null;
                 const isCte = spedDoc.reg === 'D100';
                 return {
                    key: spedDoc.key,
                    type: isCte ? 'CTE' : 'NFE',
                    Fornecedor: participant ? participant.nome : 'N/A',
                    Emissão: parseSpedDate(spedDoc.dtDoc),
                    Total: parseFloat(String(spedDoc.vlDoc || '0').replace(',', '.')),
                };
            });

        const validKeys = [...chavesValidasMap.values()]
            .filter(item => spedDocData.has(item['Chave de acesso']))
            .map(item => ({ ...item, key: item['Chave de acesso'], type: item['Tipo'] || 'N/A' }));
        
        logFn("Verificando divergências de data, valor e cadastro (IE/UF).");
        
        const consolidatedDivergencesMap = new Map<string, ConsolidatedDivergence>();

        validKeys.forEach(nota => {
            if (!nota || !nota.key) return;

            const spedDoc = spedDocData.get(nota.key);
            if (!spedDoc) return;
            
            const docType = nota.type === 'CTE' ? 'CTE' : 'NFE';
            const divergenceMessages: string[] = [];

            // Date Check
            const xmlDateStr = nota.Emissão as string; // Already in YYYY-MM-DD from processor
            const spedDateStr = spedDoc.dtDoc ? `${spedDoc.dtDoc.substring(4, 8)}-${spedDoc.dtDoc.substring(2, 4)}-${spedDoc.dtDoc.substring(0, 2)}` : '';

            // Base object for consolidated view
            const baseDivergence: ConsolidatedDivergence = {
                'Tipo': docType,
                'Chave de Acesso': nota.key,
                'Data Emissão XML': xmlDateStr ? `${xmlDateStr.substring(8,10)}/${xmlDateStr.substring(5,7)}/${xmlDateStr.substring(0,4)}` : 'Inválida',
                'Data Emissão SPED': spedDoc.dtDoc ? `${spedDoc.dtDoc.substring(0, 2)}/${spedDoc.dtDoc.substring(2, 4)}/${spedDoc.dtDoc.substring(4, 8)}` : 'Inválida',
                'Data Entrada/Saída SPED': spedDoc.dtES ? `${spedDoc.dtES.substring(0, 2)}/${spedDoc.dtES.substring(2, 4)}/${spedDoc.dtES.substring(4, 8)}` : 'Inválida',
                'Valor XML': 0,
                'Valor SPED': 0,
                'UF no XML': 'N/A',
                'IE no XML': 'N/A',
                'Resumo das Divergências': '',
            };
            
            if (xmlDateStr && spedDateStr && xmlDateStr !== spedDateStr) {
                divergenceMessages.push("Data");
            }

            // Value Check
            const xmlValue = nota.Total || (nota.type === 'CTE' ? nota['Valor da Prestação'] : 0) || 0;
            let spedValue = 0;
            if (docType === 'CTE') {
                 spedValue = parseFloat(String(spedDoc.vlDoc || '0').replace(',', '.'));
            } else { //NFE
                 spedValue = parseFloat(String(spedDoc.vlDoc || '0').replace(',', '.'));
            }
            baseDivergence['Valor XML'] = xmlValue;
            baseDivergence['Valor SPED'] = spedValue;
            if (Math.abs(xmlValue - spedValue) > 0.01) {
                divergenceMessages.push("Valor");
            }
            
            // UF/IE Check (for NFE destined to Grantel)
            const xmlIE = cleanAndToStr(nota.destIE);
            const xmlUF = nota.destUF?.trim().toUpperCase();
            baseDivergence['IE no XML'] = xmlIE || 'Em branco';
            baseDivergence['UF no XML'] = xmlUF || 'Em branco';

            if (docType === 'NFE' && cleanAndToStr(nota.destCNPJ) === GRANTEL_CNPJ) {
                if (xmlUF !== GRANTEL_UF) {
                    divergenceMessages.push("UF");
                }
                if (xmlIE !== GRANTEL_IE) {
                    divergenceMessages.push("IE");
                }
            }

            // If any divergence was found, add to the consolidated map
            if (divergenceMessages.length > 0) {
                baseDivergence['Resumo das Divergências'] = divergenceMessages.join(', ');
                consolidatedDivergencesMap.set(nota.key, baseDivergence);
            }
        });

        const consolidatedDivergences = Array.from(consolidatedDivergencesMap.values());
        
        // Create specific divergence lists from the consolidated one
        const dateDivergences = consolidatedDivergences
            .filter(d => d['Resumo das Divergências'].includes('Data'))
            .map(d => ({ 'Tipo': d.Tipo, 'Chave de Acesso': d['Chave de Acesso'], 'Data Emissão XML': d['Data Emissão XML'], 'Data Emissão SPED': d['Data Emissão SPED'], 'Data Entrada/Saída SPED': d['Data Entrada/Saída SPED'] }));

        const valueDivergences = consolidatedDivergences
            .filter(d => d['Resumo das Divergências'].includes('Valor'))
            .map(d => ({ 'Tipo': d.Tipo, 'Chave de Acesso': d['Chave de Acesso'], 'Valor XML': d['Valor XML'], 'Valor SPED': d['Valor SPED'] }));
        
        const ufDivergences = consolidatedDivergences
            .filter(d => d['Resumo das Divergências'].includes('UF'))
            .map(d => ({ 'Tipo': d.Tipo, 'Chave de Acesso': d['Chave de Acesso'], 'CNPJ do Emissor': chavesValidasMap.get(d['Chave de Acesso'])?.emitCNPJ || '', 'Nome do Emissor': chavesValidasMap.get(d['Chave de Acesso'])?.emitName || '', 'UF no XML': d['UF no XML'] }));

        const ieDivergences = consolidatedDivergences
            .filter(d => d['Resumo das Divergências'].includes('IE'))
            .map(d => ({ 'Tipo': d.Tipo, 'Chave de Acesso': d['Chave de Acesso'], 'CNPJ do Emissor': chavesValidasMap.get(d['Chave de Acesso'])?.emitCNPJ || '', 'Nome do Emissor': chavesValidasMap.get(d['Chave de Acesso'])?.emitName || '', 'IE no XML': d['IE no XML'] }));

        logFn(`- ${ufDivergences.length} divergências de UF encontradas.`);
        logFn(`- ${ieDivergences.length} divergências de IE encontradas.`);
        logFn(`- ${dateDivergences.length} divergências de data encontradas.`);
        logFn(`- ${valueDivergences.length} divergências de valor encontradas.`);
        logFn(`- Total de ${consolidatedDivergences.length} chaves com alguma divergência.`);


        const allSpedKeys: SpedKeyObject[] = [...spedDocData.keys()].map(key => ({ key, foundInSped: true }));
        
        const keyCheckResults: KeyCheckResult = { 
            keysNotFoundInTxt, 
            keysInTxtNotInSheet, 
            duplicateKeysInSheet, 
            duplicateKeysInTxt, 
            validKeys,
            dateDivergences,
            valueDivergences,
            ufDivergences,
            ieDivergences,
            consolidatedDivergences,
        };

        return { keyCheckResults, spedInfo: currentSpedInfo, allSpedKeys };
    }, [chavesValidas]);


    const handleProcess = async () => {
        if (!spedFiles || spedFiles.length === 0) {
            toast({ variant: "destructive", title: "Arquivo faltando", description: "Por favor, carregue o arquivo SPED (.txt)." });
            return;
        }

        setLoading(true);
        setResults(null);
        setError(null);
        setLogs([]);

        setTimeout(async () => {
            try {
                const fileContents = await Promise.all(spedFiles.map(file => readFileAsTextWithEncoding(file)));
                const localLogs: string[] = [];
                const logFn = (message: string) => localLogs.push(`[${new Date().toLocaleTimeString()}] ${message}`);

                const { keyCheckResults, spedInfo, allSpedKeys, error } = await checkSpedKeysInBrowser(fileContents, logFn);
                setLogs(localLogs);
                
                if (error) {
                    throw new Error(error);
                }

                if (!keyCheckResults || !allSpedKeys) {
                     throw new Error("Não foi possível extrair as chaves do arquivo SPED. Verifique o formato do arquivo.");
                }
                
                setResults(keyCheckResults);
                setSpedInfo(spedInfo);
                
                onSpedProcessed(spedInfo, keyCheckResults);
                
                toast({ title: "Verificação concluída", description: "As chaves foram comparadas com sucesso. Prossiga para as abas de análise." });

            } catch (err: any) {
                setError(err.message);
                toast({ variant: "destructive", title: "Erro na verificação", description: err.message });
            } finally {
                setLoading(false);
            }
        }, 50);
    };

    const handleClearVerification = () => {
        setResults(null);
        setLogs([]);
        setError(null);
        setSpedInfo(null);
        
        onFilesChange([]);
        onSpedProcessed(null, null);

        const spedInput = document.getElementById('sped-upload') as HTMLInputElement;
        if (spedInput) spedInput.value = "";
        
        toast({ title: "Verificação limpa", description: "Os resultados e o arquivo da verificação SPED foram removidos." });
    };

    const handleCorrectSped = async () => {
        if (!spedFiles || spedFiles.length === 0) {
            toast({ variant: "destructive", title: "Arquivo faltando", description: "Por favor, carregue o arquivo SPED (.txt) primeiro." });
            return;
        }
        setIsCorrecting(true);
        setCorrectionResult(null);
        setIsCorrectionModalOpen(true);

        setTimeout(async () => {
            try {
                const fileContent = await readFileAsTextWithEncoding(spedFiles[0]);
                const result = processSpedFileInBrowser(fileContent, nfeEntradaData, cteData);
                setCorrectionResult(result);
                toast({ title: "Correção Concluída", description: "O arquivo SPED foi analisado." });
            } catch (err: any) {
                setCorrectionResult({
                    fileName: `erro_sped.txt`,
                    error: err.message,
                    linesRead: 0,
                    linesModified: 0,
                    modifications: { truncation: [], unitStandardization: [], removed0190: [], addressSpaces: [], ieCorrection: [], cteSeriesCorrection: [], count9900: [], blockCount: [], totalLineCount: [] },
                    log: [`ERRO FATAL: ${err.message}`]
                });
                toast({ variant: "destructive", title: "Erro na correção", description: err.message });
            } finally {
                setIsCorrecting(false);
            }
        }, 50);
    };

    const handleDownloadCorrected = () => {
        if (!correctionResult || !correctionResult.fileContent) {
            toast({ variant: "destructive", title: "Nenhum resultado para baixar" });
            return;
        }
        const blob = new Blob([correctionResult.fileContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', correctionResult.fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };
    
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            toast({ title: "Copiado", description: "O erro foi copiado para a área de transferência." });
        }).catch(() => {
            toast({ variant: 'destructive', title: `Falha ao copiar` });
        });
    };

    const ModificationDisplay = ({ logs }: { logs: ModificationLog[] }) => (
        <ScrollArea className="h-[calc(80vh-250px)] pr-4">
            <div className="text-sm font-mono whitespace-pre-wrap space-y-4">
                {logs.map((log, index) => (
                    <div key={index} className="p-2 rounded-md border">
                        <p className="font-bold text-muted-foreground">Linha {log.lineNumber}:</p>
                        <p className="text-red-600 dark:text-red-400"><b>Original:</b> {log.original}</p>
                        <p className="text-green-600 dark:text-green-400"><b>Corrigida:</b> {log.corrected}</p>
                    </div>
                ))}
            </div>
        </ScrollArea>
    );

    const RemovedLinesDisplay = ({ logs }: { logs: RemovedLineLog[] }) => (
        <ScrollArea className="h-[calc(80vh-250px)] pr-4">
            <div className="text-sm font-mono whitespace-pre-wrap space-y-2">
                {logs.map((log, index) => (
                    <div key={index} className="p-2 rounded-md border bg-yellow-100 dark:bg-yellow-900/30">
                        <p><b>Removida (Linha {log.lineNumber}):</b> {log.line}</p>
                    </div>
                ))}
            </div>
        </ScrollArea>
    );

    return (
        <div className="space-y-8">
            {spedInfo && (
                <Card>
                    <CardHeader>
                        <CardTitle className="font-headline text-xl flex items-center gap-2">
                             <ShieldCheck className="h-6 w-6 text-green-600" />
                            { spedInfo.companyName ? `Informações de ${spedInfo.companyName}` : "Informações do SPED Processado" }
                        </CardTitle>
                        <CardDescription>
                           { spedInfo.cnpj && spedInfo.competence ? `Resultados para o CNPJ ${formatCnpj(spedInfo.cnpj)} na competência ${spedInfo.competence}.` : "Informações extraídas do ficheiro SPED."}
                        </CardDescription>
                    </CardHeader>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <UploadCloud className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="font-headline text-2xl">Carregar arquivo SPED</CardTitle>
                            <CardDescription>Faça o upload do arquivo SPED (.txt) para comparar com as chaves válidas.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-6">
                     <div className="relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary/50 p-4 transition-all min-h-[120px]">
                        {spedFiles.length > 0 && (
                             <div className="absolute right-1 top-1 flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                                    <label htmlFor="sped-upload-add-more" className="cursor-pointer">
                                        <FileUp className="h-4 w-4" />
                                    </label>
                                </Button>
                                <input id="sped-upload-add-more" type="file" className="sr-only" accept=".txt" onChange={handleFileChange} multiple />
                            </div>
                        )}
                        <label htmlFor="sped-upload" className="flex h-full w-full cursor-pointer flex-col items-center justify-center text-center">
                             {spedFiles.length > 0 ? <FileText className="h-8 w-8 text-primary" /> : <Upload className="h-8 w-8 text-muted-foreground" />}
                            <p className="mt-2 font-semibold">{spedFiles.length > 0 ? `${spedFiles.length} arquivo(s) selecionado(s)` : 'Clique para carregar o(s) arquivo(s) .txt'}</p>
                             <p className="text-xs text-muted-foreground">Arquivo SPED Fiscal</p>
                        </label>
                        <input id="sped-upload" type="file" className="sr-only" accept=".txt" onChange={handleFileChange} multiple />
                    </div>

                    {spedFiles.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-sm font-medium">Arquivos Carregados:</h4>
                            <div className="flex flex-wrap gap-2">
                                {spedFiles.map((file, index) => (
                                    <div key={index} className="flex items-center gap-2 rounded-md border bg-muted px-2 py-1 text-sm">
                                        <span>{file.name}</span>
                                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeSpedFile(file)}>
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                   
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Button onClick={handleProcess} disabled={loading || !spedFiles || spedFiles.length === 0} className="w-full">
                            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando...</> : 'Verificar Chaves'}
                        </Button>
                         <Dialog open={isCorrectionModalOpen} onOpenChange={setIsCorrectionModalOpen}>
                            <DialogTrigger asChild>
                                <Button onClick={handleCorrectSped} disabled={isCorrecting || !spedFiles || spedFiles.length === 0} variant="secondary" className="w-full">
                                    {isCorrecting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Corrigindo...</> : 'Corrigir e Baixar Arquivo SPED'}
                                </Button>
                            </DialogTrigger>
                           <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
                                <DialogHeader>
                                    <DialogTitle>Correção do Arquivo SPED</DialogTitle>
                                    <DialogDescription>
                                        O arquivo foi processado. Verifique os logs e baixe a versão corrigida.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="flex-grow overflow-hidden">
                                {isCorrecting ? (
                                    <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                                ) : correctionResult ? (
                                    <Tabs defaultValue="summary" className="flex flex-col h-full">
                                         <TabsList className="grid w-full grid-cols-3">
                                            <TabsTrigger value="summary">Resumo</TabsTrigger>
                                            <TabsTrigger value="modifications">Modificações ({correctionResult.linesModified})</TabsTrigger>
                                            <TabsTrigger value="full_log">Log Completo</TabsTrigger>
                                        </TabsList>

                                        <TabsContent value="summary" className="mt-4 flex-grow">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-center">
                                                <div className="rounded-lg border bg-card p-4"><p className="text-sm font-medium text-muted-foreground">Linhas Lidas</p><p className="text-2xl font-bold">{correctionResult.linesRead}</p></div>
                                                <div className="rounded-lg border bg-card p-4"><p className="text-sm font-medium text-muted-foreground">Linhas Modificadas</p><p className="text-2xl font-bold">{correctionResult.linesModified}</p></div>
                                            </div>
                                             <div className="mt-6 space-y-2 text-sm">
                                                <p><strong className="text-primary">Contadores:</strong> {correctionResult.modifications.blockCount.length + correctionResult.modifications.totalLineCount.length + correctionResult.modifications.count9900.length} linhas corrigidas.</p>
                                                <p><strong className="text-primary">Inscrição Estadual (NF-e):</strong> {correctionResult.modifications.ieCorrection.length} linhas corrigidas.</p>
                                                <p><strong className="text-primary">Série (CT-e):</strong> {correctionResult.modifications.cteSeriesCorrection.length} linhas corrigidas.</p>
                                                <p><strong className="text-primary">Endereços (Espaços):</strong> {correctionResult.modifications.addressSpaces.length} linhas corrigidas.</p>
                                                <p><strong className="text-primary">Truncamento de Campos:</strong> {correctionResult.modifications.truncation.length} linhas corrigidas.</p>
                                                <p><strong className="text-primary">Padronização de Unidades:</strong> {correctionResult.modifications.unitStandardization.length} linhas corrigidas.</p>
                                                <p><strong className="text-primary">Registros 0190 Removidos:</strong> {correctionResult.modifications.removed0190.length} linhas removidas.</p>
                                            </div>
                                        </TabsContent>

                                        <TabsContent value="modifications" className="mt-4 flex-grow overflow-hidden">
                                            <Tabs defaultValue="counters" className="flex flex-col h-full">
                                                <TabsList className="h-auto flex-wrap justify-start">
                                                    <TabsTrigger value="counters">Contadores ({correctionResult.modifications.blockCount.length + correctionResult.modifications.totalLineCount.length + correctionResult.modifications.count9900.length})</TabsTrigger>
                                                    <TabsTrigger value="ie">IE (NF-e) ({correctionResult.modifications.ieCorrection.length})</TabsTrigger>
                                                    <TabsTrigger value="cte_series">Série (CT-e) ({correctionResult.modifications.cteSeriesCorrection.length})</TabsTrigger>
                                                    <TabsTrigger value="address">Endereços ({correctionResult.modifications.addressSpaces.length})</TabsTrigger>
                                                    <TabsTrigger value="truncation">Truncamento ({correctionResult.modifications.truncation.length})</TabsTrigger>
                                                    <TabsTrigger value="units">Unidades ({correctionResult.modifications.unitStandardization.length})</TabsTrigger>
                                                    <TabsTrigger value="removed">0190 Removidos ({correctionResult.modifications.removed0190.length})</TabsTrigger>
                                                </TabsList>
                                                <div className="flex-grow overflow-hidden mt-2">
                                                    <TabsContent value="counters" className="h-full">
                                                         <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded-md mb-2 flex items-center gap-2">
                                                            <TooltipProvider><Tooltip><TooltipTrigger><HelpCircle className="h-4 w-4"/></TooltipTrigger><TooltipContent><p>A contagem de linhas em cada bloco (registros x990) e a contagem total (9999) foram recalculadas.</p></TooltipContent></Tooltip></TooltipProvider>
                                                            <span>Contagem de linhas de cada bloco e do ficheiro recalculada.</span>
                                                        </div>
                                                        <ModificationDisplay logs={[...correctionResult.modifications.blockCount, ...correctionResult.modifications.totalLineCount, ...correctionResult.modifications.count9900]} />
                                                    </TabsContent>
                                                    <TabsContent value="ie" className="h-full">
                                                         <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded-md mb-2 flex items-center gap-2">
                                                            <TooltipProvider><Tooltip><TooltipTrigger><HelpCircle className="h-4 w-4"/></TooltipTrigger><TooltipContent><p>A Inscrição Estadual (IE) de participantes (registo 0150) foi corrigida com base nos dados dos XMLs.</p></TooltipContent></Tooltip></TooltipProvider>
                                                            <span>IE do participante corrigida com base nos XMLs.</span>
                                                        </div>
                                                        <ModificationDisplay logs={correctionResult.modifications.ieCorrection} />
                                                    </TabsContent>
                                                    <TabsContent value="cte_series" className="h-full">
                                                         <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded-md mb-2 flex items-center gap-2">
                                                            <TooltipProvider><Tooltip><TooltipTrigger><HelpCircle className="h-4 w-4"/></TooltipTrigger><TooltipContent><p>A série de CT-es (registo D100) foi corrigida com base nos dados dos XMLs de CTe.</p></TooltipContent></Tooltip></TooltipProvider>
                                                            <span>Série do CT-e (D100) corrigida com base nos XMLs.</span>
                                                        </div>
                                                        <ModificationDisplay logs={correctionResult.modifications.cteSeriesCorrection} />
                                                    </TabsContent>
                                                    <TabsContent value="address" className="h-full">
                                                         <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded-md mb-2 flex items-center gap-2">
                                                            <TooltipProvider><Tooltip><TooltipTrigger><HelpCircle className="h-4 w-4"/></TooltipTrigger><TooltipContent><p>Espaços múltiplos no campo de complemento do endereço (registro 0150) foram substituídos por um único espaço.</p></TooltipContent></Tooltip></TooltipProvider>
                                                            <span>Espaços múltiplos no complemento do endereço foram corrigidos.</span>
                                                        </div>
                                                        <ModificationDisplay logs={correctionResult.modifications.addressSpaces} />
                                                    </TabsContent>
                                                    <TabsContent value="truncation" className="h-full">
                                                         <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded-md mb-2 flex items-center gap-2">
                                                            <TooltipProvider><Tooltip><TooltipTrigger><HelpCircle className="h-4 w-4"/></TooltipTrigger><TooltipContent><p>Campos de texto livre (ex: observações) foram limitados a 235 caracteres para evitar erros de importação.</p></TooltipContent></Tooltip></TooltipProvider>
                                                            <span>Campos de texto livre (observações) foram limitados a 235 caracteres.</span>
                                                        </div>
                                                        <ModificationDisplay logs={correctionResult.modifications.truncation} />
                                                    </TabsContent>
                                                    <TabsContent value="units" className="h-full">
                                                        <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded-md mb-2 flex items-center gap-2">
                                                            <TooltipProvider><Tooltip><TooltipTrigger><HelpCircle className="h-4 w-4"/></TooltipTrigger><TooltipContent><p>Unidades de medida de produtos foram padronizadas para 'un' para manter a consistência.</p></TooltipContent></Tooltip></TooltipProvider>
                                                            <span>Unidades de medida de produtos foram padronizadas para 'un'.</span>
                                                        </div>
                                                        <ModificationDisplay logs={correctionResult.modifications.unitStandardization} />
                                                    </TabsContent>
                                                     <TabsContent value="removed" className="h-full">
                                                         <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded-md mb-2 flex items-center gap-2">
                                                            <TooltipProvider><Tooltip><TooltipTrigger><HelpCircle className="h-4 w-4"/></TooltipTrigger><TooltipContent><p>Registros do tipo '0190' desnecessários (todos exceto os definidos) foram removidos.</p></TooltipContent></Tooltip></TooltipProvider>
                                                            <span>Registros '0190' desnecessários foram removidos.</span>
                                                        </div>
                                                        <RemovedLinesDisplay logs={correctionResult.modifications.removed0190} />
                                                    </TabsContent>
                                                </div>
                                            </Tabs>
                                        </TabsContent>

                                        <TabsContent value="full_log" className="mt-4 flex-grow overflow-hidden">
                                            <LogDisplay logs={correctionResult.log} />
                                        </TabsContent>
                                    </Tabs>
                                ) : null}
                                </div>
                                <DialogFooter className="pt-4 border-t">
                                    <Button variant="outline" onClick={() => setIsCorrectionModalOpen(false)}>Fechar</Button>
                                    <Button onClick={handleDownloadCorrected} disabled={!correctionResult || !!correctionResult.error}>
                                        <Download className="mr-2 h-4 w-4" /> Baixar Arquivo Corrigido
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </CardContent>
            </Card>

            {(logs.length > 0 || error) && (
                <Card className="shadow-lg">
                     <CardHeader>
                        <div className="flex items-center gap-3">
                            <Terminal className="h-8 w-8 text-primary" />
                            <div>
                                <CardTitle className="font-headline text-2xl">Análise de Processamento (Verificação)</CardTitle>
                                <CardDescription>Logs detalhados da execução da verificação de chaves no navegador.</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                     <CardContent>
                        {error && (
                            <Alert variant="destructive" className="mb-4">
                                <div className="flex justify-between items-start">
                                    <div className="flex">
                                        <FileWarning className="h-4 w-4" />
                                        <div className="ml-3">
                                            <AlertTitle>Erro</AlertTitle>
                                            <AlertDescription>{error}</AlertDescription>
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(error)}>
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </Alert>
                        )}
                        <LogDisplay logs={logs} />
                    </CardContent>
                </Card>
            )}

            {results && (
                <Card className="shadow-lg">
                    <CardHeader>
                         <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="flex items-center gap-3">
                                <Search className="h-8 w-8 text-primary" />
                                <div>
                                    <CardTitle className="font-headline text-2xl">Resultados da Verificação</CardTitle>
                                    <CardDescription>Compare as chaves da planilha com as chaves do arquivo SPED para encontrar inconsistências.</CardDescription>
                                </div>
                            </div>
                            <Button variant="destructive" size="sm" onClick={handleClearVerification}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Limpar Verificação
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <KeyResultsDisplay 
                            results={results} 
                        />
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
```

---

## `src/components/app/file-upload-form.tsx`

```tsx
"use client"

import type { ChangeEvent } from "react";
import { Upload, File, X, FileCheck, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export type FileList = Record<string, boolean>;

interface FileUploadFormProps {
    files: FileList;
    onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
    onClearFile: (fileName: string) => void;
    requiredFiles?: string[];
    xmlFileCount?: number;
    displayName?: string;
    formId?: string;
}

export function FileUploadForm({
    requiredFiles = [],
    files,
    onFileChange,
    onClearFile,
    xmlFileCount = 0,
    displayName,
    formId,
}: FileUploadFormProps) {
    const getFileAcceptType = (fileName: string) => {
        if (fileName.startsWith('xml') || (displayName && displayName.toLowerCase().includes('xml'))) {
            return '.xml,.zip';
        }
        if (fileName.toLowerCase().includes('txt')) {
            return '.txt';
        }
        return ".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel";
    }

    const getBaseName = (fileName: string) => {
        if (displayName) return displayName;
        if (fileName.startsWith('xml')) return "XMLs NFe/CTe";
        return `${fileName}.xlsx`;
    }

    // Single uploader mode (when displayName is provided)
    if (displayName && formId) {
        const hasFile = files[formId];
        const addMoreId = `${formId}-add-more`;
        return (
            <div className="relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary/50 p-4 transition-all min-h-[160px]">
                {hasFile && (
                     <div className="absolute right-1 top-1 flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                            <label htmlFor={addMoreId} className="cursor-pointer">
                                <FileUp className="h-4 w-4" />
                            </label>
                        </Button>
                         <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onClearFile(formId)}>
                            <X className="h-4 w-4" />
                        </Button>
                        <input id={addMoreId} name={addMoreId} type="file" accept={getFileAcceptType(formId)} className="sr-only" onChange={onFileChange} multiple />
                    </div>
                )}
                {hasFile ? (
                    <div className="flex flex-col items-center gap-2 text-center">
                        <FileCheck className="h-10 w-10 text-primary" />
                        <p className="font-semibold">{displayName}</p>
                        <p className="text-xs text-muted-foreground">
                            {xmlFileCount > 0 ? `${xmlFileCount} arquivo(s) carregado(s)` : 'Arquivo carregado'}
                        </p>
                    </div>
                ) : (
                    <>
                        <label htmlFor={formId} className="flex h-full w-full cursor-pointer flex-col items-center justify-center text-center">
                            <Upload className="h-10 w-10 text-muted-foreground" />
                            <p className="mt-2 font-semibold">{displayName}</p>
                            <p className="text-sm text-muted-foreground">Carregue ficheiros ou uma pasta .zip</p>
                        </label>
                        <input
                            id={formId}
                            name={formId}
                            type="file"
                            accept={getFileAcceptType(formId)}
                            className="sr-only"
                            onChange={onFileChange}
                            multiple
                        />
                    </>
                )}
            </div>
        )
    }

    // Grid mode for multiple required files
    return (
        <>
            {requiredFiles.map((name) => {
                 const addMoreId = `${name}-add-more`;
                 const hasFile = files[name];
                 return (
                    <div key={name} className="relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-secondary/50 p-4 transition-all min-h-[160px]">
                        {hasFile && (
                            <div className="absolute right-1 top-1 flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                                    <label htmlFor={addMoreId} className="cursor-pointer">
                                        <FileUp className="h-4 w-4" />
                                    </label>
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onClearFile(name)}>
                                    <X className="h-4 w-4" />
                                </Button>
                                <input id={addMoreId} name={addMoreId} type="file" accept={getFileAcceptType(name)} className="sr-only" onChange={onFileChange} multiple={name.startsWith('xml')} />
                            </div>
                        )}
                        {hasFile ? (
                            <div className="flex flex-col items-center gap-2 text-center">
                                <FileCheck className="h-10 w-10 text-primary" />
                                <p className="font-semibold">{getBaseName(name)}</p>
                                <p className="text-xs text-muted-foreground">
                                    {name.startsWith('xml') && xmlFileCount > 0 ? `${xmlFileCount} arquivo(s) carregado(s)` : 'Arquivo carregado'}
                                </p>
                            </div>
                        ) : (
                             <>
                                <label htmlFor={name} className="flex h-full w-full cursor-pointer flex-col items-center justify-center text-center">
                                    <Upload className="h-10 w-10 text-muted-foreground" />
                                    <p className="mt-2 font-semibold">{getBaseName(name)}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {name.startsWith('xml') ? 'Carregue ficheiros ou uma pasta .zip' : 'Clique para carregar'}
                                    </p>
                                </label>
                                <input
                                    id={name}
                                    name={name}
                                    type="file"
                                    accept={getFileAcceptType(name)}
                                    className="sr-only"
                                    onChange={onFileChange}
                                    multiple={name.startsWith('xml')}
                                />
                            </>
                        )}
                    </div>
                );
            })}
        </>
    );
}
```

---

## `src/components/app/results-display.tsx`

```tsx
"use client"

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from '@/components/app/data-table';
import { getColumns } from '@/lib/columns-helper';

interface ResultsDisplayProps {
    results: Record<string, any[]>;
}

export function ResultsDisplay({ results }: ResultsDisplayProps) {
    const [activeTab, setActiveTab] = useState('');

    const orderedSheetNames = [
        "Notas Válidas", "CTEs Válidos", "Itens Válidos", "Chaves Válidas", "Saídas", "Itens Válidos Saídas",
        "Imobilizados",
        "Emissão Própria", "Notas Canceladas",
        ...Object.keys(results).filter(name => name.startsWith("Original - "))
    ];
    
    useEffect(() => {
        // We don't use sessionStorage anymore, just set to first valid tab
        if (orderedSheetNames.length > 0) {
            const firstValidSheet = orderedSheetNames.find(sheetName => results[sheetName] && results[sheetName].length > 0);
            setActiveTab(firstValidSheet || '');
        }
    }, [results]); // Only depends on results now

    const handleTabChange = (value: string) => {
        setActiveTab(value);
    };
    
    const getDisplayName = (sheetName: string) => {
        const nameMap: Record<string, string> = {
            "Original - NFE": "Entradas",
            "Original - Saídas": "Saídas",
            "Original - CTE": "CTE",
            "Original - Itens": "Itens Entradas",
            "Original - Itens Saídas": "Itens Saídas",
            "Original - NFE Operação Não Realizada": "Op Não Realizada",
            "Original - NFE Operação Desconhecida": "Op Desconhecida",
            "Original - CTE Desacordo de Serviço": "CTE Desacordo",
            "Original - Itens do Sienge": "Sienge"
        };
        return nameMap[sheetName] || sheetName;
    };

    return (
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
                <div className='flex-grow overflow-x-auto'>
                    <TabsList className="inline-flex h-auto">
                        {orderedSheetNames.map(sheetName => (
                            results[sheetName] && results[sheetName].length > 0 && 
                            <TabsTrigger key={sheetName} value={sheetName}>{getDisplayName(sheetName)}</TabsTrigger>
                        ))}
                    </TabsList>
                </div>
            </div>
            {orderedSheetNames.map(sheetName => (
                results[sheetName] && results[sheetName].length > 0 && (
                    <TabsContent key={sheetName} value={sheetName}>
                        <DataTable columns={getColumns(results[sheetName])} data={results[sheetName]} />
                    </TabsContent>
                )
            ))}
        </Tabs>
    );
}
```

---

## `src/components/app/data-table.tsx`

```tsx
"use client"

import * as React from "react"
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  footer?: Record<string, string>;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  footer
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = React.useState('')

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
  })

  return (
    <div>
        <div className="flex items-center py-4">
            <Input
            placeholder="Filtrar todos os dados..."
            value={globalFilter ?? ''}
            onChange={(event) =>
                setGlobalFilter(String(event.target.value))
            }
            className="max-w-sm"
            />
      </div>
      <ScrollArea className="rounded-md border whitespace-nowrap">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  Nenhum resultado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
           {footer && (
            <TableFooter>
                <TableRow>
                    {columns.map((column: any) => (
                        <TableCell key={column.id} className="font-bold text-base">
                            {footer[column.id] || ''}
                        </TableCell>
                    ))}
                </TableRow>
            </TableFooter>
           )}
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <div className="flex items-center justify-end space-x-2 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Próxima
        </Button>
      </div>
    </div>
  )
}
```