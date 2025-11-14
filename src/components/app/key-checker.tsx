
"use client";

import { useState, useCallback, type ChangeEvent, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { KeyRound, FileText, Loader2, Download, FileWarning, UploadCloud, Terminal, Search, Trash2, Copy, ShieldCheck, HelpCircle, X, FileUp, Upload, Settings } from "lucide-react";
import { KeyResultsDisplay } from "@/components/app/key-results-display";
import { formatCnpj, cleanAndToStr, parseSpedDate } from "@/lib/utils";
import type { SpedInfo, SpedCorrectionResult } from "@/lib/excel-processor";
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
import { LogDisplay } from "@/components/app/log-display";


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
    removeUnusedProducts: boolean;
    removeUnusedParticipants: boolean;
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
    removeUnusedProducts: "Remover Produtos (0200) Não Utilizados em Itens (C170)",
    removeUnusedParticipants: "Remover Participantes (0150) Não Utilizados"
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
        removed0200: [],
        removed0150: [],
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
    
    let intermediateLines: string[] = lines;

    if (config.removeDivergent && divergentKeys.size > 0) {
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
         _log(`Remoção por divergência concluída. ${totalRemoved} linhas removidas devido a ${Object.keys(modifications.divergenceRemoval).length} chaves com divergência.`);
        intermediateLines = filteredLines;
    }

    if (config.removeUnusedProducts) {
        _log("Iniciando remoção de produtos (0200) não utilizados.");
        const usedProductCodes = new Set<string>();
        intermediateLines.forEach(line => {
            const parts = line.split('|');
            if (parts.length > 2 && parts[1] === 'C170' && parts[2]) {
                usedProductCodes.add(parts[2]);
            }
        });

        const filteredLines: string[] = [];
        for (let i = 0; i < intermediateLines.length; i++) {
            const line = intermediateLines[i];
            const parts = line.split('|');
            if (parts.length > 2 && parts[1] === '0200' && !usedProductCodes.has(parts[2])) {
                modifications.removed0200.push({ lineNumber: i + 1, line });
                linesModifiedCount++;
                continue; // Skip this line
            }
            filteredLines.push(line);
        }
        _log(`Remoção de produtos não utilizados concluída. ${modifications.removed0200.length} registos 0200 removidos.`);
        intermediateLines = filteredLines;
    }
    
     if (config.removeUnusedParticipants) {
        _log("Iniciando remoção de participantes (0150) não utilizados.");
        const usedParticipantCodes = new Set<string>();
        intermediateLines.forEach(line => {
            const parts = line.split('|');
            if (parts.length > 4) {
                if ((parts[1] === 'C100' || parts[1] === 'D100' || parts[1] === 'D500') && parts[4]) {
                    usedParticipantCodes.add(parts[4]);
                }
            }
        });

        const filteredLines: string[] = [];
        for (let i = 0; i < intermediateLines.length; i++) {
            const line = intermediateLines[i];
            const parts = line.split('|');
            if (parts.length > 2 && parts[1] === '0150' && !usedParticipantCodes.has(parts[2])) {
                modifications.removed0150.push({ lineNumber: i + 1, line });
                linesModifiedCount++;
                continue; // Skip this line
            }
            filteredLines.push(line);
        }
        _log(`Remoção de participantes não utilizados concluída. ${modifications.removed0150.length} registos 0150 removidos.`);
        intermediateLines = filteredLines;
    }

    let modifiedLines: string[] = [];
    const TRUNCATION_CODES = new Set(['0450', '0460', 'C110']);
    const MAX_CHARS_TRUNCATION = 235;
    const UNIT_FIELD_CONFIG: Record<string, number> = { '0200': 6, 'C170': 6 };

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
            
            if (regType === '0990') {
                 const expectedCount = blockLineCounts['0'] || 0;
                 if (parts.length > 2 && parseInt(parts[2], 10) !== expectedCount) {
                    const originalLine = line;
                    parts[2] = String(expectedCount);
                    modifiedLines[i] = parts.join('|');
                    modifications.blockCount.push({ lineNumber: i + 1, original: originalLine, corrected: modifiedLines[i] });
                    linesModifiedCount++;
                 }
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

// ... o resto do ficheiro KeyChecker continua aqui ...

