"use client";

import { useState, useEffect, useCallback, type ChangeEvent, useMemo } from "react";
import { Sheet, UploadCloud, Cpu, Home, Trash2, AlertCircle, Terminal, Copy, Loader2, FileSearch, CheckCircle, AlertTriangle, FileUp, Filter, TrendingUp, FilePieChart, Settings, Building, History, Save } from "lucide-react";
import JSZip from "jszip";
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
import { ImobilizadoAnalysis, type AllClassifications } from "@/components/app/imobilizado-analysis";
import { HistoryAnalysis, type SessionData } from "@/components/app/history-analysis";


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

const IMOBILIZADO_STORAGE_KEY = 'imobilizadoClassifications_v2';
const SESSIONS_STORAGE_KEY = 'analysisSessions_v2';


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
    const [imobilizadoClassifications, setImobilizadoClassifications] = useState<AllClassifications>({});
    const [saidasStatus, setSaidasStatus] = useState<Record<number, 'emitida' | 'cancelada' | 'inutilizada'>>({});


    const { toast } = useToast();

    // State for period selection modal
    const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);
    const [availablePeriods, setAvailablePeriods] = useState<string[]>([]);
    const [selectedPeriods, setSelectedPeriods] = useState<Record<string, boolean>>({});
    const [isPreProcessing, setIsPreProcessing] = useState(false);
    
    // UI Settings state
    const [isWideMode, setIsWideMode] = useState(false);
    const [activeMainTab, setActiveMainTab] = useState("history");

    // =================================================================
    // PERSISTENCE (localStorage)
    // =================================================================
    useEffect(() => {
        // Load imobilizado classifications from localStorage
        try {
            const savedImobilizado = localStorage.getItem(IMOBILIZADO_STORAGE_KEY);
            if (savedImobilizado) setImobilizadoClassifications(JSON.parse(savedImobilizado));
        } catch (e) {
            console.error("Failed to load imobilizado classifications from localStorage", e);
        }

        // Load UI settings
        const wideMode = localStorage.getItem('ui-widemode') === 'true';
        setIsWideMode(wideMode);
    }, []);

    const handlePersistImobilizado = (allDataToSave: AllClassifications) => {
        setImobilizadoClassifications(allDataToSave);
        try {
            localStorage.setItem(IMOBILIZADO_STORAGE_KEY, JSON.stringify(allDataToSave));
            toast({
                title: "Classificações de Imobilizado Guardadas",
                description: "As suas classificações e códigos de ativo foram guardados no armazenamento local do navegador."
            });
        } catch(e) {
            console.error("Failed to save imobilizado classifications to localStorage", e);
            toast({ variant: 'destructive', title: "Erro ao guardar classificações"});
        }
    };

    const handleSaveSession = () => {
        const currentCompetence = competence;
        if (!currentCompetence) {
            toast({ variant: 'destructive', title: 'Competência não definida', description: 'Processe os dados primeiro.' });
            return;
        }
        if (!processedData) {
            toast({ variant: 'destructive', title: 'Dados não processados', description: 'Valide os dados antes de guardar a sessão.' });
            return;
        }

        const sessionData: SessionData = {
            competence: currentCompetence,
            processedAt: new Date().toISOString(),
            fileNames: { // Still useful for user reference in the history tab
                nfeEntrada: xmlFiles.nfeEntrada.map(f => f.name),
                cte: xmlFiles.cte.map(f => f.name),
                nfeSaida: xmlFiles.nfeSaida.map(f => f.name),
                nfse: xmlFiles.nfse.map(f => f.name),
                manifesto: Object.keys(fileStatus),
                sienge: siengeFile ? siengeFile.name : null,
                sped: spedFiles.map(f => f.name),
            },
            processedData: processedData,
            lastSaidaNumber: lastSaidaNumber,
            disregardedNfseNotes: Array.from(disregardedNfseNotes),
            saidasStatus: saidasStatus,
        };

        try {
            const existingSessionsRaw = localStorage.getItem(SESSIONS_STORAGE_KEY);
            const existingSessions: SessionData[] = existingSessionsRaw ? JSON.parse(existingSessionsRaw) : [];
            
            const newSessions = existingSessions.filter(s => s.competence !== currentCompetence);
            newSessions.push(sessionData);

            localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(newSessions));
            toast({ title: "Sessão Guardada no Histórico", description: `A análise completa para a competência ${currentCompetence} foi guardada.` });
        } catch (e: any) {
            console.error("Failed to save session to localStorage", e);
             toast({
                variant: 'destructive',
                title: `ERRO: Falha ao guardar a sessão`,
                description: "Os dados processados podem ser demasiado grandes para o armazenamento local. Tente com um período menor."
            });
        }
    };
    
    const handleRestoreSession = (session: SessionData) => {
        handleClearAllData();
        
        // Restore the entire processed state
        setProcessedData(session.processedData);
        
        // Restore lightweight state
        setLastSaidaNumber(session.lastSaidaNumber || 0);
        setSaidasStatus(session.saidasStatus || {});
        setDisregardedNfseNotes(new Set(session.disregardedNfseNotes || []));

        // Restore period selection
        const periods = session.competence.split('_');
        const restoredPeriods: Record<string, boolean> = {};
        periods.forEach(p => { restoredPeriods[p] = true });
        setSelectedPeriods(restoredPeriods);
        setAvailablePeriods(periods);
        
        toast({
            title: "Sessão Restaurada com Sucesso",
            description: `A análise completa para a competência ${session.competence} foi carregada.`,
        });

        // Switch to the first analysis tab to show the restored data
        setActiveMainTab("nf-stock");
    };

    // =================================================================
    // UI SETTINGS
    // =================================================================
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
        setSaidasStatus({});
        // Não limpamos imobilizadoClassifications aqui para manter a persistência

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
            "Notas Válidas", "Itens Válidos", "Itens Acima de 1200", "Chaves Válidas", "Saídas", "Itens Válidos Saídas",
            "Imobilizados",
            "Devoluções de Clientes", "Notas Canceladas",
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
            "Itens Acima de 1200": "Itens > 1200",
            "Devoluções de Clientes": "Devolucoes Clientes",
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
            const allXmlsToScan = [...xmlFiles.nfeEntrada, ...xmlFiles.cte, ...xmlFiles.nfeSaida];

            if (allXmlsToScan.length > 0) {
                const { nfe, cte, saidas } = await processUploadedXmls(allXmlsToScan, () => {}, "desconhecido");
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
        setProcessedData(null);
        setIsPeriodModalOpen(false);
        
        setProcessing(true);
        
        setTimeout(async () => {
            try {
                const localLogs: string[] = [];
                const log = (message: string) => localLogs.push(`[${new Date().toLocaleTimeString()}] ${message}`);
                
                let dataToProcess: Record<string, any[]> = {};
                let eventCanceledKeys = new Set<string>();

                // Process each XML category separately to respect user's choice
                log("Processando ficheiros XML por categoria...");
                const { nfe: nfeEntrada, itens: itensEntrada, canceledKeys: canceledEntrada, saidas: devolucoesClientes } = await processUploadedXmls(xmlFiles.nfeEntrada, log, "entrada");
                const { cte, canceledKeys: canceledCte } = await processUploadedXmls(xmlFiles.cte, log, "cte");
                const { saidas, itensSaidas, canceledKeys: canceledSaida } = await processUploadedXmls(xmlFiles.nfeSaida, log, "saida");

                // Combine results
                dataToProcess["NFE"] = nfeEntrada;
                dataToProcess["Itens"] = itensEntrada;
                dataToProcess["CTE"] = cte;
                dataToProcess["Saídas"] = saidas;
                dataToProcess["Itens Saídas"] = itensSaidas;
                
                // Keep devoluções separate
                dataToProcess["Devoluções de Clientes"] = devolucoesClientes;
                
                eventCanceledKeys = new Set([...canceledEntrada, ...canceledCte, ...canceledSaida]);

                log(`Processamento XML concluído: ${nfeEntrada.length} NF-e Entradas, ${saidas.length} NF-e Saídas, ${cte.length} CT-es, ${devolucoesClientes.length} Devoluções de Cliente.`);
                
                // Merge with sheet data (manifesto files only)
                for (const fileName of requiredFiles) {
                    if (files[fileName]) {
                        dataToProcess[fileName] = files[fileName];
                        log(`Usando dados da planilha de manifesto carregada: '${fileName}'.`);
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
                
                    Object.keys(dataToProcess).forEach(key => {
                        if (['NFE', 'CTE', 'Saídas', 'Devoluções de Clientes'].includes(key)) {
                             const originalCount = dataToProcess[key].length;
                             dataToProcess[key] = filterByPeriod(dataToProcess[key]);
                             log(`- ${key}: ${dataToProcess[key].length}/${originalCount} registos mantidos após filtro.`);
                        }
                    });
                     
                    const chavesNfe = new Set(dataToProcess['NFE'].map(n => n['Chave Unica']));
                    const chavesCte = new Set(dataToProcess['CTE'].map(n => n['Chave Unica']));
                    const chavesSaidas = new Set(dataToProcess['Saídas'].map(n => n['Chave Unica']));
                    
                     if(dataToProcess['Itens']) {
                        dataToProcess['Itens'] = (dataToProcess['Itens'] || []).filter(item => chavesNfe.has(item['Chave Unica']) || chavesCte.has(item['Chave Unica']));
                    }
                     if(dataToProcess['Itens Saídas']) {
                        dataToProcess['Itens Saídas'] = (dataToProcess['Itens Saídas'] || []).filter(item => chavesSaidas.has(item['Chave Unica']));
                    }
                }

                // Now, process the combined and filtered data
                const resultData = processDataFrames(dataToProcess, eventCanceledKeys, log);
                setLogs(localLogs);

                if (!resultData) throw new Error("O processamento não retornou dados.");

                setProcessedData(resultData);
                toast({ title: "Validação concluída", description: "Prossiga para as próximas etapas. Pode guardar a sessão no histórico na última aba." });

            } catch (err: any) {
                const errorMessage = err.message || "Ocorreu um erro desconhecido durante o processamento.";
                setError(errorMessage);
                setProcessedData(null);
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

    const saidasNfeTabDisabled = !processedData?.sheets['Saídas'] || processedData.sheets['Saídas'].length === 0;
    const nfseTabDisabled = xmlFiles.nfse.length === 0 && (!processedData || !processedData.fileNames?.nfse || processedData.fileNames.nfse.length === 0);
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
                    <Tabs value={activeMainTab} onValueChange={setActiveMainTab} className="w-full">
                        <TabsList className="grid w-full grid-cols-1 md:grid-cols-6">
                             <TabsTrigger value="history" className="flex items-center gap-2">
                                <History className="h-5 w-5" /> Histórico
                            </TabsTrigger>
                             <TabsTrigger value="nf-stock" className="flex items-center gap-2">
                                1. Validação
                                {((Object.keys(fileStatus).length > 0 || xmlFiles.nfeEntrada.length > 0 || xmlFiles.cte.length > 0 || xmlFiles.nfeSaida.length > 0) || (processedData)) && (
                                    processedData && Object.keys(processedData.sheets).length > 0 ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-yellow-600" />
                                )}
                            </TabsTrigger>
                            <TabsTrigger value="saidas-nfe" disabled={saidasNfeTabDisabled} className="flex items-center gap-2">
                                2. Análise Saídas
                                {processedData?.sheets['Saídas'] && <CheckCircle className="h-5 w-5 text-green-600" />}
                            </TabsTrigger>
                            <TabsTrigger value="nfse" disabled={nfseTabDisabled} className="flex items-center gap-2">
                                3. Análise NFS-e
                                {(!nfseTabDisabled) && <FilePieChart className="h-5 w-5 text-primary" />}
                            </TabsTrigger>
                            <TabsTrigger value="imobilizado" disabled={imobilizadoTabDisabled}>
                                4. Imobilizado
                                {processedData?.sheets['Imobilizados'] && <CheckCircle className="h-5 w-5 text-green-600" />}
                            </TabsTrigger>
                            <TabsTrigger value="analyses" disabled={analysisTabDisabled} className="flex items-center gap-2">
                                5. Análises Avançadas
                                {processedData?.keyCheckResults && <CheckCircle className="h-5 w-5 text-green-600" />}
                            </TabsTrigger>
                        </TabsList>

                         {/* ======================= ABA 0: HISTÓRICO ======================= */}
                        <TabsContent value="history" className="mt-6">
                            <HistoryAnalysis
                                sessionsKey={SESSIONS_STORAGE_KEY}
                                onRestoreSession={handleRestoreSession}
                            />
                        </TabsContent>

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
                                            {isPreProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Analisando...</> : (processing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Processando...</> : "Validar Dados")}
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
                                    initialStatus={saidasStatus}
                                    onStatusChange={setSaidasStatus}
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
                            <ImobilizadoAnalysis 
                                items={processedData?.sheets?.['Imobilizados'] || []}
                                onPersistData={handlePersistImobilizado}
                                allPersistedData={imobilizadoClassifications}
                                competence={competence}
                            />
                        </TabsContent>

                        {/* ======================= ABA 5: ANÁLISES AVANÇADAS ======================= */}
                         <TabsContent value="analyses" className="mt-6">
                             {processedData ? (
                                <AdditionalAnalyses 
                                    processedData={processedData}
                                    onSiengeDataProcessed={handleSiengeDataProcessed}
                                    siengeFile={siengeFile}
                                    onSiengeFileChange={setSiengeFile}
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
                                    onSaveSession={handleSaveSession}
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
                            Selecione os meses de referência que deseja incluir no processamento. Isto definirá a competência da sessão.
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
                            Processar Períodos
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
