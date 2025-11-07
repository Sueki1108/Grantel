
"use client";

import { useState, useCallback, type ChangeEvent, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { KeyRound, FileText, Loader2, Download, FileWarning, UploadCloud, Terminal, Search, Trash2, Copy, ShieldCheck, HelpCircle, X, FileUp, Upload, Settings } from "lucide-react";
import { KeyResultsDisplay } from "@/components/app/key-results-display";
import { LogDisplay } from "@/components/app/log-display";
import { formatCnpj, cleanAndToStr, parseSpedDate } from "@/lib/utils";
import type { SpedKeyObject, SpedInfo, SpedCorrectionResult } from "@/lib/excel-processor";
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
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ScrollArea } from "../ui/scroll-area";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { DataTable } from "./data-table";
import { getColumns } from "@/lib/columns-helper";


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
    tomadorCNPJ?: string;
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

type DivergenceRemovalLog = {
    [key: string]: {
        parentLine: RemovedLineLog;
        childrenLines: RemovedLineLog[];
    };
};


const GRANTEL_CNPJ = "81732042000119";
const GRANTEL_IE = "9015130668";
const GRANTEL_UF = "PR";

export type SpedCorrectionConfig = {
    removeDivergent: boolean;
    fixCounters: boolean;
    fixIE: boolean;
    fixCteSeries: boolean;
    fixAddressSpaces: boolean;
    fixTruncation: boolean;
    fixUnits: boolean;
    remove0190: boolean;
};

const correctionConfigLabels: Record<keyof SpedCorrectionConfig, string> = {
    removeDivergent: "Remover Registos com Divergência de IE/UF",
    fixCounters: "Recalcular Contadores de Linhas e Blocos",
    fixIE: "Corrigir Inscrição Estadual (IE) de Participantes (NF-e)",
    fixCteSeries: "Corrigir Série de CT-e",
    fixAddressSpaces: "Corrigir Espaços Duplos em Endereços",
    fixTruncation: "Limitar Campos de Texto a 235 Caracteres",
    fixUnits: "Padronizar Unidades de Medida para 'un'",
    remove0190: "Remover Registos 0190 Desnecessários",
};


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

const processSpedFileInBrowser = (
    spedFileContent: string, 
    nfeData: any[], 
    cteData: any[],
    divergentKeys: Set<string>,
    config: SpedCorrectionConfig
): SpedCorrectionResult => {
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
        divergenceRemoval: {},
    };
    const _log = (message: string) => log.push(`[${new Date().toLocaleTimeString()}] ${message}`);

    _log(`Iniciando processamento do arquivo SPED com as seguintes configurações: ${JSON.stringify(config)}`);

    const cnpjToIeMap = new Map<string, string>();
    if (config.fixIE && nfeData && nfeData.length > 0) {
        nfeData.forEach(nota => {
            const cnpj = cleanAndToStr(nota.emitCNPJ || nota['CPF/CNPJ do Fornecedor']);
            const ie = cleanAndToStr(nota.emitIE);
            if (cnpj && ie && !cnpjToIeMap.has(cnpj)) {
               cnpjToIeMap.set(cnpj, ie);
            }
        });
         _log(`Mapa de referência CNPJ x IE (NF-e) criado com ${cnpjToIeMap.size} entradas.`);
    } else {
        _log("AVISO: Correção de IE para NF-e desativada ou dados não disponíveis.");
    }
    
    const cteKeyToSeriesMap = new Map<string, string>();
    if (config.fixCteSeries && cteData && cteData.length > 0) {
        cteData.forEach(cte => {
            const key = cleanAndToStr(cte['Chave de acesso']);
            const series = cleanAndToStr(cte['Série']);
            if (key && series && !cteKeyToSeriesMap.has(key)) {
                cteKeyToSeriesMap.set(key, series);
            }
        });
        _log(`Mapa de referência Chave CT-e x Série criado com ${cteKeyToSeriesMap.size} entradas.`);
    } else {
         _log("AVISO: Correção de Série para CT-e desativada ou dados não disponíveis.");
    }


    const lines = spedFileContent.split(/\r?\n/);
    let linesModifiedCount = 0;

    const TRUNCATION_CODES = new Set(['0450', '0460', 'C110']);
    const MAX_CHARS_TRUNCATION = 235;
    const UNIT_FIELD_CONFIG: Record<string, number> = { '0200': 6, 'C170': 6 };
    
    let intermediateLines: string[] = lines;

    if (config.removeDivergent) {
        const filteredLines: string[] = [];
        let isInsideDivergentBlock = false;
        let currentDivergentKey: string | null = null;
        _log(`Iniciando verificação de remoção para ${divergentKeys.size} chaves com divergência.`);

        for(let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line) continue;

            const parts = line.split('|');
            const regType = parts[1];

            if (regType === 'C100' || regType === 'D100') {
                isInsideDivergentBlock = false;
                currentDivergentKey = null;
                const keyIndex = regType === 'C100' ? 9 : 10;
                const key = parts.length > keyIndex ? cleanAndToStr(parts[keyIndex]) : '';
                
                if (key && divergentKeys.has(key)) {
                    isInsideDivergentBlock = true;
                    currentDivergentKey = key;
                    modifications.divergenceRemoval[key] = {
                        parentLine: { lineNumber: i + 1, line: line },
                        childrenLines: []
                    };
                    linesModifiedCount++;
                }
            }
            
            if (isInsideDivergentBlock) {
                 if (currentDivergentKey && regType !== 'C100' && regType !== 'D100') {
                     modifications.divergenceRemoval[currentDivergentKey].childrenLines.push({ lineNumber: i + 1, line: line });
                 }
                continue; 
            }
            
            filteredLines.push(line);
        }
         const totalRemoved = Object.values(modifications.divergenceRemoval).reduce((acc, curr) => acc + 1 + curr.childrenLines.length, 0);
         _log(`Remoção concluída. ${totalRemoved} linhas removidas devido a ${Object.keys(modifications.divergenceRemoval).length} chaves com divergência.`);
        intermediateLines = filteredLines;
    }

    let modifiedLines: string[] = [];
    for (let i = 0; i < intermediateLines.length; i++) {
        let originalLine = intermediateLines[i];
        if (!originalLine) continue;
        
        const parts = originalLine.split('|');
        const codeType = parts[1];
        
        if (config.remove0190 && codeType === '0190') {
            const lineToKeep1 = '|0190|un|Unidade|';
            const lineToKeep2 = '|0190|pc|Peça|';
            const trimmedLine = originalLine.trim();

            if (trimmedLine !== lineToKeep1 && trimmedLine !== lineToKeep2) {
                modifications.removed0190.push({ lineNumber: i + 1, line: originalLine });
                if (!modifications.removed0190.find(log => log.line === originalLine)) linesModifiedCount++;
                continue;
            }
        }
        
        let currentLine = originalLine;
        let lineWasModified = false;
        
        if (config.fixIE && codeType === '0150' && parts.length > 7 && cnpjToIeMap.size > 0) {
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

        if (config.fixCteSeries && codeType === 'D100' && parts.length > 10 && cteKeyToSeriesMap.size > 0) {
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
        
        if (config.fixAddressSpaces && codeType === '0150' && parts.length > 12) {
            const addressComplement = parts[12] || '';
            if (/\s{2,}/.test(addressComplement)) {
                parts[12] = addressComplement.replace(/\s+/g, ' ').trim();
                currentLine = parts.join('|');
                modifications.addressSpaces.push({ lineNumber: i + 1, original: originalLine, corrected: currentLine });
                lineWasModified = true;
            }
        }

        if (config.fixUnits && codeType) {
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

        if (config.fixTruncation && codeType && TRUNCATION_CODES.has(codeType)) {
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
        
        if (lineWasModified && originalLine !== currentLine && !modifications.truncation.some(log => log.original === originalLine) && !modifications.unitStandardization.some(log => log.original === originalLine) && !modifications.addressSpaces.some(log => log.original === originalLine) && !modifications.ieCorrection.some(log => log.original === originalLine) && !modifications.cteSeriesCorrection.some(log => log.original === originalLine)) {
                 linesModifiedCount++;
        }

        modifiedLines.push(currentLine);
    }
    
    if (config.fixCounters) {
        _log("Iniciando a recontagem de linhas dos blocos e registos.");
        
        const recordCounts: { [reg: string]: number } = {};
        const blockLineCounts: { [block: string]: number } = {};

        modifiedLines.forEach(line => {
            if (!line) return;
            const parts = line.split('|');
            const regType = parts[1];
            if (regType) {
                recordCounts[regType] = (recordCounts[regType] || 0) + 1;

                const blockChar = regType.charAt(0);
                blockLineCounts[blockChar] = (blockLineCounts[blockChar] || 0) + 1;
            }
        });

        for (let i = 0; i < modifiedLines.length; i++) {
            let line = modifiedLines[i];
            if (!line) continue;
            const parts = line.split('|');
            const regType = parts[1];
            
            // Corrige o totalizador do bloco 0 (registro 0990)
            if (regType === '0990') {
                 const expectedCount = blockLineCounts['0'] || 0;
                 if (parts.length > 2 && parseInt(parts[2], 10) !== expectedCount) {
                    const originalLine = line;
                    parts[2] = String(expectedCount);
                    modifiedLines[i] = parts.join('|');
                    modifications.blockCount.push({ lineNumber: i + 1, original: originalLine, corrected: modifiedLines[i] });
                    linesModifiedCount++;
                 }
            // Corrige totalizadores de outros blocos (C990, D990, etc.)
            } else if (regType && regType.endsWith('990') && regType !== '0990') {
                const blockChar = regType.charAt(0);
                const expectedCount = blockLineCounts[blockChar] || 0;
                if (parts.length > 2 && parseInt(parts[2], 10) !== expectedCount) {
                    const originalLine = line;
                    parts[2] = String(expectedCount);
                    modifiedLines[i] = parts.join('|');
                    modifications.blockCount.push({ lineNumber: i + 1, original: originalLine, corrected: modifiedLines[i] });
                    linesModifiedCount++;
                }
            // Corrige totalizadores de registos (9900) para todos os tipos (C100, C170, C190, etc.)
            } else if (regType === '9900' && parts.length > 3) {
                const countedReg = parts[2];
                const expectedCount = recordCounts[countedReg] || 0;
                if (parseInt(parts[3], 10) !== expectedCount) {
                    const originalLine = line;
                    parts[3] = String(expectedCount);
                    modifiedLines[i] = parts.join('|');
                    modifications.count9900.push({ lineNumber: i + 1, original: originalLine, corrected: modifiedLines[i] });
                    linesModifiedCount++;
                }
            // Corrige o totalizador geral do ficheiro (9999)
            } else if (regType === '9999') {
                const expectedTotal = modifiedLines.length;
                if (parts.length > 2 && parseInt(parts[2], 10) !== expectedTotal) {
                    const originalLine = line;
                    parts[2] = String(expectedTotal);
                    modifiedLines[i] = parts.join('|');
                    modifications.totalLineCount.push({ lineNumber: i + 1, original: originalLine, corrected: modifiedLines[i] });
                    linesModifiedCount++;
                }
            }
        }
         _log(`Recontagem de linhas e registos concluída.`);
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

const checkSpedKeysInBrowser = async (chavesValidas: any[], spedFileContents: string[], logFn: (message: string) => void): Promise<{
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

            if (reg === 'C100' && parts.length > 9 && parts[9]?.length === 44) {
                key = parts[9];
                docData = { key, reg, indOper: parts[2], codPart: parts[4], dtDoc: parts[10], dtES: parts[11], vlDoc: parts[12], vlDesc: parts[14] };
            } else if (reg === 'D100' && parts.length > 17 && parts[10]?.length === 44) {
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
             const spedDate = parseSpedDate(spedDoc.dtDoc);
             return {
                key: spedDoc.key,
                type: isCte ? 'CTE' : 'NFE',
                Fornecedor: participant ? participant.nome : 'N/A',
                Emissão: isNaN(spedDate.getTime()) ? spedDoc.dtDoc : spedDate,
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

        const xmlDateStr = nota.Emissão as string;
        const spedDateStr = spedDoc.dtDoc ? `${spedDoc.dtDoc.substring(4, 8)}-${spedDoc.dtDoc.substring(2, 4)}-${spedDoc.dtDoc.substring(0, 2)}` : '';

        const baseDivergence: ConsolidatedDivergence = {
            'Tipo': docType, 'Chave de Acesso': nota.key,
            'Data Emissão XML': xmlDateStr ? `${xmlDateStr.substring(8,10)}/${xmlDateStr.substring(5,7)}/${xmlDateStr.substring(0,4)}` : 'Inválida',
            'Data Emissão SPED': spedDoc.dtDoc ? `${spedDoc.dtDoc.substring(0, 2)}/${spedDoc.dtDoc.substring(2, 4)}/${spedDoc.dtDoc.substring(4, 8)}` : 'Inválida',
            'Data Entrada/Saída SPED': spedDoc.dtES ? `${spedDoc.dtES.substring(0, 2)}/${spedDoc.dtES.substring(2, 4)}/${spedDoc.dtES.substring(4, 8)}` : 'Inválida',
            'Valor XML': 0, 'Valor SPED': 0,
            'UF no XML': 'N/A', 'IE no XML': 'N/A', 'Resumo das Divergências': '',
        };
        
        if (xmlDateStr && spedDateStr && xmlDateStr !== spedDateStr) divergenceMessages.push("Data");

        const xmlValue = nota.Total || (nota.type === 'CTE' ? nota['Valor da Prestação'] : 0) || 0;
        let spedValue = parseFloat(String(spedDoc.vlDoc || '0').replace(',', '.'));
        
        baseDivergence['Valor XML'] = xmlValue;
        baseDivergence['Valor SPED'] = spedValue;
        if (Math.abs(xmlValue - spedValue) > 0.01) divergenceMessages.push("Valor");
        
        if (docType === 'NFE' && cleanAndToStr(nota.destCNPJ) === GRANTEL_CNPJ) {
             const xmlIE = cleanAndToStr(nota.destIE);
             const xmlUF = nota.destUF?.trim().toUpperCase();
             baseDivergence['IE no XML'] = xmlIE || 'Em branco';
             baseDivergence['UF no XML'] = xmlUF || 'Em branco';
            if (xmlUF !== GRANTEL_UF) divergenceMessages.push("UF");
            if (xmlIE !== GRANTEL_IE) divergenceMessages.push("IE");
        } else if (docType === 'CTE' && cleanAndToStr(nota.tomadorCNPJ) === GRANTEL_CNPJ) {
             const participant = spedDoc.codPart ? participantData.get(spedDoc.codPart) : null;
             if(participant) {
                 const spedIE = cleanAndToStr(participant.ie);
                 const spedUF = participant.uf?.trim().toUpperCase();
                 baseDivergence['IE no XML'] = spedIE || 'Em branco';
                 baseDivergence['UF no XML'] = spedUF || 'Em branco';
                if (spedUF !== GRANTEL_UF) divergenceMessages.push("UF");
                if (spedIE !== GRANTEL_IE) divergenceMessages.push("IE");
             }
        }


        if (divergenceMessages.length > 0) {
            baseDivergence['Resumo das Divergências'] = divergenceMessages.join(', ');
            consolidatedDivergencesMap.set(nota.key, baseDivergence);
        }
    });

    const consolidatedDivergences = Array.from(consolidatedDivergencesMap.values());
    
    const dateDivergences = consolidatedDivergences.filter(d => d['Resumo das Divergências'].includes('Data')).map(d => ({ 'Tipo': d.Tipo, 'Chave de Acesso': d['Chave de Acesso'], 'Data Emissão XML': d['Data Emissão XML'], 'Data Emissão SPED': d['Data Emissão SPED'], 'Data Entrada/Saída SPED': d['Data Entrada/Saída SPED'] }));
    const valueDivergences = consolidatedDivergences.filter(d => d['Resumo das Divergências'].includes('Valor')).map(d => ({ 'Tipo': d.Tipo, 'Chave de Acesso': d['Chave de Acesso'], 'Valor XML': d['Valor XML'], 'Valor SPED': d['Valor SPED'] }));
    const ufDivergences = consolidatedDivergences.filter(d => d['Resumo das Divergências'].includes('UF')).map(d => ({ 'Tipo': d.Tipo, 'Chave de Acesso': d['Chave de Acesso'], 'CNPJ do Emissor': chavesValidasMap.get(d['Chave de Acesso'])?.emitCNPJ || '', 'Nome do Emissor': chavesValidasMap.get(d['Chave de Acesso'])?.emitName || '', 'UF no XML': d['UF no XML'] }));
    const ieDivergences = consolidatedDivergences.filter(d => d['Resumo das Divergências'].includes('IE')).map(d => ({ 'Tipo': d.Tipo, 'Chave de Acesso': d['Chave de Acesso'], 'CNPJ do Emissor': chavesValidasMap.get(d['Chave de Acesso'])?.emitCNPJ || '', 'Nome do Emissor': chavesValidasMap.get(d['Chave de Acesso'])?.emitName || '', 'IE no XML': d['IE no XML'] }));

    logFn(`- ${ufDivergences.length} divergências de UF encontradas.`);
    logFn(`- ${ieDivergences.length} divergências de IE encontradas.`);
    logFn(`- ${dateDivergences.length} divergências de data encontradas.`);
    logFn(`- ${valueDivergences.length} divergências de valor encontradas.`);
    logFn(`- Total de ${consolidatedDivergences.length} chaves com alguma divergência.`);


    const allSpedKeys: SpedKeyObject[] = [...spedDocData.keys()].map(key => ({ key, foundInSped: true }));
    
    const keyCheckResults: KeyCheckResult = { 
        keysNotFoundInTxt, keysInTxtNotInSheet, duplicateKeysInSheet, duplicateKeysInTxt, validKeys,
        dateDivergences, valueDivergences, ufDivergences, ieDivergences, consolidatedDivergences,
    };

    return { keyCheckResults, spedInfo: currentSpedInfo, allSpedKeys };
}

// Main Component
interface KeyCheckerProps {
    chavesValidas: any[];
    spedFiles: File[];
    onFilesChange: (files: File[]) => void;
    onSpedProcessed: (spedInfo: SpedInfo | null, keyCheckResults: KeyCheckResult | null, spedCorrections: SpedCorrectionResult | null) => void;
    initialSpedInfo: SpedInfo | null;
    initialKeyCheckResults: KeyCheckResult | null;
    nfeEntradaData: any[];
    cteData: any[];
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
    const [loading, setLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();
    const [correctionResult, setCorrectionResult] = useState<SpedCorrectionResult | null>(null);
    const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
    const [correctionConfig, setCorrectionConfig] = useState<SpedCorrectionConfig>({
        removeDivergent: true, fixCounters: true, fixIE: true, fixCteSeries: true,
        fixAddressSpaces: true, fixTruncation: true, fixUnits: true, remove0190: true
    });
    
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
        
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
    };

    const handleVerify = async () => {
        if (!spedFiles || spedFiles.length === 0) {
            toast({ variant: "destructive", title: "Arquivo faltando", description: "Por favor, carregue o arquivo SPED (.txt)." });
            return;
        }

        setLoading('verify');
        setResults(null);
        setError(null);
        setCorrectionResult(null);

        setTimeout(async () => {
            try {
                const fileContents = await Promise.all(spedFiles.map(file => readFileAsTextWithEncoding(file)));
                
                const { keyCheckResults, spedInfo, error } = await checkSpedKeysInBrowser(chavesValidas, fileContents, () => {});
                
                if (error) throw new Error(error);
                if (!keyCheckResults) throw new Error("Não foi possível extrair as chaves do arquivo SPED.");
                
                setResults(keyCheckResults);
                setSpedInfo(spedInfo);
                
                onSpedProcessed(spedInfo, keyCheckResults, null); 
                
                toast({ title: "Verificação concluída", description: "As chaves foram comparadas com sucesso. Prossiga para as abas de análise." });

            } catch (err: any) {
                setError(err.message);
                toast({ variant: "destructive", title: "Erro na Verificação", description: err.message });
            } finally {
                setLoading(null);
            }
        }, 50);
    };

    const handleCorrectSped = async () => {
        if (!spedFiles || spedFiles.length === 0) {
            toast({ variant: "destructive", title: "Arquivo faltando", description: "Por favor, carregue o arquivo SPED (.txt) primeiro." });
            return;
        }
        if (!results) {
             toast({ variant: "destructive", title: "Análise prévia necessária", description: "Execute a 'Verificação de Chaves' primeiro para identificar as divergências." });
            return;
        }

        setLoading('correct');
        setCorrectionResult(null);
        setIsCorrectionModalOpen(true);

        setTimeout(async () => {
            try {
                const ieDivergentKeys = new Set(results.ieDivergences?.map(d => d['Chave de Acesso']) || []);
                const ufDivergentKeys = new Set(results.ufDivergences?.map(d => d['Chave de Acesso']) || []);
                const divergentKeys = new Set([...ieDivergentKeys].filter(key => ufDivergentKeys.has(key)));
                
                const fileContent = await readFileAsTextWithEncoding(spedFiles[0]);
                const result = processSpedFileInBrowser(fileContent, nfeEntradaData, cteData, divergentKeys, correctionConfig);
                
                setCorrectionResult(result);
                onSpedProcessed(spedInfo, results, result);
                
                toast({ title: "Correção Concluída", description: "O arquivo SPED foi analisado e está pronto para ser baixado." });
            } catch (err: any) {
                setCorrectionResult({
                    fileName: `erro_sped.txt`,
                    error: err.message,
                    linesRead: 0,
                    linesModified: 0,
                    modifications: { truncation: [], unitStandardization: [], removed0190: [], addressSpaces: [], ieCorrection: [], cteSeriesCorrection: [], count9900: [], blockCount: [], totalLineCount: [], divergenceRemoval: {} },
                    log: [`ERRO FATAL: ${err.message}`]
                });
                toast({ variant: "destructive", title: "Erro na correção", description: err.message });
            } finally {
                setLoading(null);
            }
        }, 50);
    };

    const handleClearVerification = () => {
        setResults(null);
        setError(null);
        setSpedInfo(null);
        setCorrectionResult(null);
        onFilesChange([]);
        onSpedProcessed(null, null, null);

        const spedInput = document.getElementById('sped-upload') as HTMLInputElement;
        if (spedInput) spedInput.value = "";
        
        toast({ title: "Verificação limpa", description: "Os resultados e o arquivo da verificação SPED foram removidos." });
    };
    
    const DivergenceRemovalDisplay = ({ logData }: { logData: DivergenceRemovalLog }) => {
        const entries = Object.entries(logData);
        if (entries.length === 0) {
            return <p className="text-muted-foreground text-center p-4">Nenhuma linha removida por divergência.</p>
        }
        return (
            <Accordion type="single" collapsible className="w-full">
                {entries.map(([key, value]) => (
                     <AccordionItem value={key} key={key}>
                        <AccordionTrigger>
                            <div className="flex flex-col text-left">
                                <span className="font-semibold">Chave: {key}</span>
                                <span className="text-sm text-muted-foreground">Total de {1 + value.childrenLines.length} linhas removidas</span>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent>
                             <div className="p-2 border rounded-md font-mono text-xs">
                                <p className="font-bold border-b pb-1 mb-1">Linha Principal (L: {value.parentLine.lineNumber})</p>
                                <p className="text-red-600">{value.parentLine.line}</p>
                                {value.childrenLines.length > 0 && (
                                     <>
                                        <p className="font-bold border-b pb-1 mb-1 mt-2">Registos Filhos ({value.childrenLines.length})</p>
                                        {value.childrenLines.map(child => (
                                            <p key={child.lineNumber} className="text-red-600/80">L{child.lineNumber}: {child.line}</p>
                                        ))}
                                    </>
                                )}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        );
    };

    const ModificationDisplay = ({ logs }: { logs: ModificationLog[] }) => {
        if (!logs || logs.length === 0) return <p className="text-muted-foreground text-center p-4">Nenhuma modificação deste tipo.</p>;
        return (
            <ScrollArea className="h-[calc(80vh-280px)] pr-4">
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
    };
    
    const RemovedLinesDisplay = ({ logs }: { logs: RemovedLineLog[] }) => {
        if (!logs || logs.length === 0) return <p className="text-muted-foreground text-center p-4">Nenhuma linha deste tipo foi removida.</p>;
        return (
            <ScrollArea className="h-[calc(80vh-280px)] pr-4">
                <div className="text-sm font-mono whitespace-pre-wrap space-y-2">
                    {logs.map((log, index) => (
                        <div key={index} className="p-2 rounded-md border bg-yellow-100 dark:bg-yellow-900/30">
                            <p><b>Removida (Linha {log.lineNumber}):</b> {log.line}</p>
                        </div>
                    ))}
                </div>
            </ScrollArea>
        );
    };

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
                            <CardDescription>Faça o upload do arquivo SPED (.txt) para comparar com as chaves válidas e gerar o ficheiro corrigido.</CardDescription>
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
                         <Button onClick={handleVerify} disabled={loading !== null || !spedFiles || spedFiles.length === 0} className="w-full">
                            {loading === 'verify' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verificando...</> : 'Verificar Chaves'}
                        </Button>
                         <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="outline" size="icon" className="shrink-0">
                                    <Settings className="h-5 w-5" />
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Configurar Correções do SPED</DialogTitle>
                                    <DialogDescription>
                                        Selecione quais correções automáticas deseja aplicar ao ficheiro SPED.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    {Object.entries(correctionConfigLabels).map(([key, label]) => (
                                        <div key={key} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={key}
                                                checked={correctionConfig[key as keyof SpedCorrectionConfig]}
                                                onCheckedChange={(checked) => {
                                                    setCorrectionConfig(prev => ({...prev, [key]: !!checked}))
                                                }}
                                            />
                                            <Label htmlFor={key} className="text-sm font-medium leading-none cursor-pointer">
                                                {label}
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                            </DialogContent>
                        </Dialog>
                        <Dialog open={isCorrectionModalOpen} onOpenChange={setIsCorrectionModalOpen}>
                            <DialogTrigger asChild>
                                <Button onClick={handleCorrectSped} disabled={loading !== null || !spedFiles || spedFiles.length === 0 || !results} variant="secondary" className="w-full">
                                    {loading === 'correct' ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Corrigindo...</> : 'Corrigir SPED'}
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
                                {loading === 'correct' ? (
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
                                                <p><strong className="text-primary">Remoção por Divergência:</strong> {Object.values(correctionResult.modifications.divergenceRemoval).reduce((acc: any, curr: any) => acc + 1 + curr.childrenLines.length, 0)} linhas removidas.</p>
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
                                            <Tabs defaultValue="divergenceRemoval" className="flex flex-col h-full">
                                                <TabsList className="h-auto flex-wrap justify-start">
                                                    <TabsTrigger value="divergenceRemoval">Remoção por Divergência ({Object.keys(correctionResult.modifications.divergenceRemoval).length})</TabsTrigger>
                                                    <TabsTrigger value="counters">Contadores ({correctionResult.modifications.blockCount.length + correctionResult.modifications.totalLineCount.length + correctionResult.modifications.count9900.length})</TabsTrigger>
                                                    <TabsTrigger value="ie">IE (NF-e) ({correctionResult.modifications.ieCorrection.length})</TabsTrigger>
                                                    <TabsTrigger value="cte_series">Série (CT-e) ({correctionResult.modifications.cteSeriesCorrection.length})</TabsTrigger>
                                                    <TabsTrigger value="address">Endereços ({correctionResult.modifications.addressSpaces.length})</TabsTrigger>
                                                    <TabsTrigger value="truncation">Truncamento ({correctionResult.modifications.truncation.length})</TabsTrigger>
                                                    <TabsTrigger value="units">Unidades ({correctionResult.modifications.unitStandardization.length})</TabsTrigger>
                                                    <TabsTrigger value="removed">0190 Removidos ({correctionResult.modifications.removed0190.length})</TabsTrigger>
                                                </TabsList>
                                                <div className="flex-grow overflow-hidden mt-2">
                                                    <TabsContent value="divergenceRemoval" className="h-full">
                                                         <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded-md mb-2 flex items-center gap-2">
                                                            <TooltipProvider><Tooltip><TooltipTrigger><HelpCircle className="h-4 w-4"/></TooltipTrigger><TooltipContent><p>Registos C100/D100 e seus filhos que apresentavam divergência de IE/UF foram removidos.</p></TooltipContent></Tooltip></TooltipProvider>
                                                            <span>Registos removidos por divergência de cadastro (IE/UF).</span>
                                                        </div>
                                                        <ScrollArea className="h-[calc(80vh-280px)] pr-4">
                                                          <DivergenceRemovalDisplay logData={correctionResult.modifications.divergenceRemoval} />
                                                        </ScrollArea>
                                                    </TabsContent>
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

            {error && (
                <Alert variant="destructive" className="mt-4">
                    <div className="flex justify-between items-start">
                        <div className="flex">
                            <FileWarning className="h-4 w-4" />
                            <div className="ml-3">
                                <AlertTitle>Erro</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </div>
                        </div>
                    </div>
                </Alert>
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
