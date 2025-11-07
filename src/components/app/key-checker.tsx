
"use client";

import { useState, useCallback, type ChangeEvent, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { KeyRound, FileText, Loader2, Download, FileWarning, UploadCloud, Terminal, Search, Trash2, Copy, ShieldCheck, HelpCircle, X, FileUp, Upload, Settings } from "lucide-react";
import { KeyResultsDisplay } from "@/components/app/key-results-display";
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
    removeUnusedParticipants: "Remover Participantes (0150) Não Utilizados (C100/D100)"
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
            if (parts.length > 4 && (parts[1] === 'C100' || parts[1] === 'D100') && parts[4]) {
                usedParticipantCodes.add(parts[4]);
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

const checkSpedKeysInBrowser = async (chavesValidas: any[], spedFileContents: string[], logFn: (message: string) => void): Promise<{
    keyCheckResults?: KeyCheckResult;
    spedInfo?: SpedInfo | null;
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
    
    const keyCheckResults: KeyCheckResult = { 
        keysNotFoundInTxt, keysInTxtNotInSheet, duplicateKeysInSheet, duplicateKeysInTxt, validKeys,
        dateDivergences, valueDivergences, ufDivergences, ieDivergences, consolidatedDivergences,
    };

    return { keyCheckResults, spedInfo: currentSpedInfo };
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
        fixAddressSpaces: true, fixTruncation: true, fixUnits: true, remove0190: true,
        removeUnusedProducts: true, removeUnusedParticipants: true
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
                const ieDivergentKeys = new Set(results.ieDivergences?.map(d => d['Chave de Acesso']));
                const ufDivergentKeys = new Set(results.ufDivergences?.map(d => d['Chave de Acesso']));
                
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
                    modifications: { truncation: [], unitStandardization: [], removed0190: [], removed0200: [], removed0150: [], addressSpaces: [], ieCorrection: [], cteSeriesCorrection: [], count9900: [], blockCount: [], totalLineCount: [], divergenceRemoval: {} },
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
    
    const RemovedLinesDisplay = ({ logs, logType }: { logs: RemovedLineLog[], logType: string }) => {
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
                                <ScrollArea className="h-96 pr-6">
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
                                </ScrollArea>
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
                                                <div className="rounded-lg border bg-card p-4"><p className="text-sm font-medium text-muted-foreground">Linhas Modificadas/Removidas</p><p className="text-2xl font-bold">{correctionResult.linesModified}</p></div>
                                            </div>
                                             <div className="mt-6 space-y-2 text-sm">
                                                <p><strong className="text-primary">Remoção por Divergência (IE/UF):</strong> {Object.values(correctionResult.modifications.divergenceRemoval).reduce((acc: any, curr: any) => acc + 1 + curr.childrenLines.length, 0)} linhas removidas.</p>
                                                <p><strong className="text-primary">Produtos Não Utilizados (0200):</strong> {correctionResult.modifications.removed0200.length} registos removidos.</p>
                                                <p><strong className="text-primary">Participantes Não Utilizados (0150):</strong> {correctionResult.modifications.removed0150.length} registos removidos.</p>
                                                <p><strong className="text-primary">Contadores (9900/x990/9999):</strong> {correctionResult.modifications.blockCount.length + correctionResult.modifications.totalLineCount.length + correctionResult.modifications.count9900.length} linhas corrigidas.</p>
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
                                                    <TabsTrigger value="divergenceRemoval">Divergência ({Object.keys(correctionResult.modifications.divergenceRemoval).length})</TabsTrigger>
                                                    <TabsTrigger value="removed0150">Part. (0150) Removidos ({correctionResult.modifications.removed0150.length})</TabsTrigger>
                                                    <TabsTrigger value="removed0200">Prod. (0200) Removidos ({correctionResult.modifications.removed0200.length})</TabsTrigger>
                                                    <TabsTrigger value="removed0190">0190 Removidos ({correctionResult.modifications.removed0190.length})</TabsTrigger>
                                                    <TabsTrigger value="counters">Contadores</TabsTrigger>
                                                    <TabsTrigger value="ie">IE (NF-e)</TabsTrigger>
                                                    <TabsTrigger value="cte_series">Série (CT-e)</TabsTrigger>
                                                    <TabsTrigger value="address">Endereços</TabsTrigger>
                                                    <TabsTrigger value="truncation">Truncamento</TabsTrigger>
                                                    <TabsTrigger value="units">Unidades</TabsTrigger>
                                                </TabsList>
                                                <div className="flex-grow overflow-hidden mt-2">
                                                    <TabsContent value="divergenceRemoval" className="h-full">
                                                         <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded-md mb-2 flex items-center gap-2">
                                                            <TooltipProvider><Tooltip><TooltipTrigger><HelpCircle className="h-4 w-4"/></TooltipTrigger><TooltipContent><p>Registos C100/D100 e seus filhos que apresentavam divergência de IE/UF foram removidos.</p></TooltipContent></Tooltip></TooltipProvider>
                                                            <span>Registos removidos por divergência de cadastro (IE e UF).</span>
                                                        </div>
                                                        <ScrollArea className="h-[calc(80vh-280px)] pr-4">
                                                          <DivergenceRemovalDisplay logData={correctionResult.modifications.divergenceRemoval} />
                                                        </ScrollArea>
                                                    </TabsContent>
                                                    <TabsContent value="removed0150" className="h-full">
                                                        <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded-md mb-2 flex items-center gap-2">
                                                            <TooltipProvider><Tooltip><TooltipTrigger><HelpCircle className="h-4 w-4"/></TooltipTrigger><TooltipContent><p>Registos de participantes (0150) que não estavam associados a nenhum documento fiscal (C100/D100) foram removidos.</p></TooltipContent></Tooltip></TooltipProvider>
                                                            <span>Participantes não utilizados foram removidos.</span>
                                                        </div>
                                                        <RemovedLinesDisplay logs={correctionResult.modifications.removed0150} logType="0150" />
                                                    </TabsContent>
                                                    <TabsContent value="removed0200" className="h-full">
                                                        <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded-md mb-2 flex items-center gap-2">
                                                            <TooltipProvider><Tooltip><TooltipTrigger><HelpCircle className="h-4 w-4"/></TooltipTrigger><TooltipContent><p>Registos de produtos (0200) que não foram utilizados em nenhum item de nota fiscal (C170) foram removidos.</p></TooltipContent></Tooltip></TooltipProvider>
                                                            <span>Produtos não utilizados foram removidos.</span>
                                                        </div>
                                                        <RemovedLinesDisplay logs={correctionResult.modifications.removed0200} logType="0200" />
                                                    </TabsContent>
                                                    <TabsContent value="removed0190" className="h-full">
                                                         <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded-md mb-2 flex items-center gap-2">
                                                            <TooltipProvider><Tooltip><TooltipTrigger><HelpCircle className="h-4 w-4"/></TooltipTrigger><TooltipContent><p>Registros do tipo '0190' desnecessários (todos exceto 'un' e 'pc') foram removidos.</p></TooltipContent></Tooltip></TooltipProvider>
                                                            <span>Registros '0190' desnecessários foram removidos.</span>
                                                        </div>
                                                        <RemovedLinesDisplay logs={correctionResult.modifications.removed0190} logType="0190" />
                                                    </TabsContent>
                                                    <TabsContent value="counters" className="h-full"><ModificationDisplay logs={[...correctionResult.modifications.blockCount, ...correctionResult.modifications.totalLineCount, ...correctionResult.modifications.count9900]} /></TabsContent>
                                                    <TabsContent value="ie" className="h-full"><ModificationDisplay logs={correctionResult.modifications.ieCorrection} /></TabsContent>
                                                    <TabsContent value="cte_series" className="h-full"><ModificationDisplay logs={correctionResult.modifications.cteSeriesCorrection} /></TabsContent>
                                                    <TabsContent value="address" className="h-full"><ModificationDisplay logs={correctionResult.modifications.addressSpaces} /></TabsContent>
                                                    <TabsContent value="truncation" className="h-full"><ModificationDisplay logs={correctionResult.modifications.truncation} /></TabsContent>
                                                    <TabsContent value="units" className="h-full"><ModificationDisplay logs={correctionResult.modifications.unitStandardization} /></TabsContent>
                                                </div>
                                            </Tabs>
                                        </TabsContent>

                                        <TabsContent value="full_log" className="mt-4 flex-grow overflow-hidden">
                                            
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

```
- workspace/src/lib/excel-processor.ts:
```ts
import { cfopDescriptions } from './cfop';
import * as XLSX from 'xlsx';
import { KeyCheckResult } from '@/components/app/key-checker';
import { type AllClassifications } from '@/components/app/imobilizado-analysis';
import { ReconciliationResults } from '@/components/app/additional-analyses';

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

export interface SpedCorrectionResult {
    fileName: string;
    fileContent?: string;
    error?: string;
    linesRead: number;
    linesModified: number;
    modifications: {
        truncation: any[];
        unitStandardization: any[];
        removed0190: any[];
        removed0200: any[];
        removed0150: any[];
        addressSpaces: any[];
        ieCorrection: any[];
        cteSeriesCorrection: any[];
        count9900: any[];
        blockCount: any[];
        totalLineCount: any[];
        divergenceRemoval: any;
    };
    log: string[];
}

export interface ProcessedData {
    sheets: DataFrames;
    spedInfo: SpedInfo | null;
    siengeSheetData: any[] | null;
    keyCheckResults: KeyCheckResult | null;
    saidasStatus?: Record<number, 'emitida' | 'cancelada' | 'inutilizada'>;
    lastSaidaNumber?: number;
    imobilizadoClassifications?: AllClassifications;
    competence: string | null;
    reconciliationResults?: ReconciliationResults | null;
    resaleAnalysis?: { noteKeys: Set<string>; xmls: File[] } | null;
    spedCorrections?: SpedCorrectionResult[] | null;
    fileNames?: {
        nfeEntrada: string[];
        cte: string[];
        nfeSaida: string[];
        nfse: string[];
        manifesto: string[];
        sienge: string | null;
        sped: string[];
    }
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

export function processDataFrames(dfs: DataFrames, eventCanceledKeys: Set<string>, log: LogFunction): Omit<ProcessedData, 'fileNames' | 'competence'> {
    
    log("Iniciando preparação dos dados no navegador...");
    const GRANTEL_CNPJ = "81732042000119";
    const originalDfs: DataFrames = {};
    const processedDfs: DataFrames = {};

    const allSheetNames = [
        "NFE", "CTE", "Itens", "Saídas", "Itens Saídas",
        "NFE Operação Não Realizada", "NFE Operação Desconhecida", 
        "CTE Desacordo de Serviço",
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

    log("Coletando chaves de exceção (canceladas, manifesto)...");
    const chavesExcecao = new Set<string>(eventCanceledKeys);
    log(`- ${eventCanceledKeys.size} chaves de cancelamento por evento de XML adicionadas.`);
    
    const addExceptionsFromDf = (df: DataFrame, chaveKey: string) => {
        df.forEach(row => {
            if (!row) return;
            const chave = cleanAndToStr(row[chaveKey]);
            if (chave) chavesExcecao.add(chave);
        });
    };
    
    addExceptionsFromDf(naoRealizada, "Chave de acesso");
    addExceptionsFromDf(desconhecida, "Chave de acesso");
    addExceptionsFromDf(desacordo, "Chave de acesso");
    
    [...nfe, ...cte, ...saidas].forEach(row => {
        if (!row) return;
        const statusVal = row["Status"];
        if (typeof statusVal === 'string' && statusVal.toLowerCase().includes('cancelada')) {
            const chave = cleanAndToStr(row["Chave de acesso"]);
            if (chave) chavesExcecao.add(chave);
        }
    });

    log(`- Total de ${chavesExcecao.size} chaves de exceção coletadas.`);
    log("Filtrando notas e itens válidos com base nas regras de negócio...");

    // 1. Separar notas com base no emitente e CFOP dos itens
    const notasValidas: any[] = [];
    const devolucoesDeCompra: any[] = []; // Emitente = Grantel, Destinatário != Grantel
    const devolucoesDeClientes: any[] = []; // Emitente != Grantel, mas CFOP do item começa com 1 ou 2
    const remessasEretornos: any[] = []; // Emitente = Grantel, Destinatário = Grantel

    const itensMap = new Map<string, any[]>();
    itens.forEach(item => {
        const chaveUnica = cleanAndToStr(item["Chave Unica"]);
        if (!itensMap.has(chaveUnica)) {
            itensMap.set(chaveUnica, []);
        }
        itensMap.get(chaveUnica)!.push(item);
    });

    [...nfe, ...cte].forEach(nota => {
        const chaveAcesso = cleanAndToStr(nota['Chave de acesso']);
        if (chavesExcecao.has(chaveAcesso)) {
            return; 
        }

        const emitenteCnpj = cleanAndToStr(nota.emitCNPJ || nota['CPF/CNPJ do Fornecedor']);
        const destCnpj = cleanAndToStr(nota.destCNPJ || nota['CPF/CNPJ do Destinatário']);

        if (emitenteCnpj === GRANTEL_CNPJ) {
            if (destCnpj === GRANTEL_CNPJ) {
                remessasEretornos.push(nota);
            } else {
                devolucoesDeCompra.push(nota);
            }
        } else {
            const notaItens = itensMap.get(cleanAndToStr(nota["Chave Unica"])) || [];
            const isDevolucaoCliente = notaItens.some(item => {
                const cfop = cleanAndToStr(item.CFOP);
                return cfop.startsWith('1') || cfop.startsWith('2');
            });

            if (isDevolucaoCliente) {
                devolucoesDeClientes.push(nota);
            } else {
                notasValidas.push(nota);
            }
        }
    });

    log(`- Total de ${notasValidas.length} notas de compra válidas (NF-e + CT-e).`);
    log(`- Total de ${devolucoesDeCompra.length} devoluções de compra (Grantel emitente) identificadas.`);
    log(`- Total de ${devolucoesDeClientes.length} devoluções de clientes (CFOP 1xxx/2xxx) identificadas.`);
    log(`- Total de ${remessasEretornos.length} remessas/retornos/transferências identificados.`);
    
    const chavesNotasValidas = new Set(notasValidas.map(row => cleanAndToStr(row["Chave Unica"])));
    let itensValidos = itens.filter(item => chavesNotasValidas.has(cleanAndToStr(item["Chave Unica"])));
    log(`- ${itensValidos.length} itens válidos de entrada correspondentes.`);

    let saidasValidas = saidas.filter(row => !chavesExcecao.has(cleanAndToStr(row['Chave de acesso'])));
    log(`- ${saidasValidas.length} saídas válidas encontradas.`);
    const chavesSaidasValidas = new Set(saidasValidas.map(row => cleanAndToStr(row["Chave Unica"])));
    const itensValidosSaidas = itensSaidas.filter(item => chavesSaidasValidas.has(cleanAndToStr(item["Chave Unica"])));
    log(`- ${itensValidosSaidas.length} itens de saída válidos correspondentes.`);
    
    log("Identificando itens para análise de imobilizado a partir dos itens válidos...");
    const nfeHeaderMap = new Map(notasValidas.map(n => [n['Chave Unica'], n]));
    const imobilizados = itensValidos
        .filter(item => {
            if (!item || !item['Valor Unitário']) return false;
            return parseFloat(String(item['Valor Unitário'])) > 1200;
        }).map((item) => {
            const uniqueItemId = `${cleanAndToStr(item['CPF/CNPJ do Emitente'])}-${cleanAndToStr(item['Código'])}`;
            const id = `${cleanAndToStr(item['Chave Unica'])}-${item['Item']}`;
            const header = nfeHeaderMap.get(item['Chave Unica']);
            const fornecedor = header?.Fornecedor || item.Fornecedor || 'N/A';
            return { ...item, id, uniqueItemId, Fornecedor: fornecedor };
        });
    log(`- ${imobilizados.length} itens com valor unitário > R$ 1.200 encontrados para análise de imobilizado.`);

    log("Agrupando resultados...");
    const notasCanceladas = [...nfe, ...cte, ...saidas].filter(row => {
        if (!row) return false;
        return chavesExcecao.has(cleanAndToStr(row["Chave de acesso"]));
    });
    
    const chavesValidasEntrada = notasValidas.filter(n => n['destUF']).map(row => ({ // Apenas NF-e
        "Chave de acesso": cleanAndToStr(row["Chave de acesso"]), "Tipo": "NFE", "Fornecedor": row["Fornecedor"],
        "Emissão": String(row["Emissão"]).substring(0, 10), "Total": row['Total'] || 0,
        "destCNPJ": row.destCNPJ, "destIE": row.destIE, "destUF": row.destUF,
        "emitCNPJ": row.emitCNPJ, "emitName": row.emitName, "emitIE": row.emitIE,
    }));

    const chavesValidasCte = notasValidas.filter(n => !n['destUF']).map(row => ({ // Apenas CT-e
        "Chave de acesso": cleanAndToStr(row["Chave de acesso"]), "Tipo": "CTE", "Fornecedor": row["Fornecedor"],
        "Emissão": String(row["Emissão"]).substring(0, 10), "Total": row['Valor da Prestação'] || 0,
        "tomadorCNPJ": cleanAndToStr(row['tomadorCNPJ'])
    }));

    const chavesValidasSaida = saidasValidas.map(row => ({
        "Chave de acesso": cleanAndToStr(row["Chave de acesso"]), "Tipo": 'Saída', "Fornecedor": row["Destinatário"], 
        "Emissão": String(row["Emissão"]).substring(0, 10), "Total": row['Total'] || 0,
    }));

    const chavesValidas = [...chavesValidasEntrada, ...chavesValidasCte, ...chavesValidasSaida];
    log(`- ${chavesValidas.length} chaves válidas totais para verificação SPED geradas.`);
    
    const finalResult: DataFrames = {
        "Notas Válidas": notasValidas,
        "Itens Válidos": itensValidos, 
        "Chaves Válidas": chavesValidas,
        "Saídas": saidasValidas, 
        "Itens Válidos Saídas": itensValidosSaidas,
        "Imobilizados": imobilizados,
        "Devoluções de Compra (Fornecedor)": devolucoesDeCompra,
        "Devoluções de Clientes": devolucoesDeClientes,
        "Remessas e Retornos": remessasEretornos,
        "Notas Canceladas": notasCanceladas,
        ...originalDfs 
    };
    
    const addCfopDescriptionToRow = (row: any) => {
        if (!row || typeof row !== 'object' || !row['CFOP']) {
            return { ...row, 'Descricao CFOP': 'N/A' };
        }
        const cfopCode = parseInt(cleanAndToStr(row['CFOP']), 10);
        const fullDescription = cfopDescriptions[cfopCode] || 'Descrição não encontrada';
        
        // Retornar a descrição completa agora
        const newRow: { [key: string]: any } = { ...row, 'Descricao CFOP': fullDescription };
        return newRow;
    };
    
    const finalSheetSet: DataFrames = {};
    const displayOrder = [
        "Notas Válidas", "Itens Válidos", "Chaves Válidas", "Saídas", "Itens Válidos Saídas",
        "Imobilizados", "Devoluções de Compra (Fornecedor)", "Devoluções de Clientes", "Remessas e Retornos",
        "Notas Canceladas", ...Object.keys(originalDfs)
    ];

    displayOrder.forEach(name => {
        let sheetData = finalResult[name];
        if (sheetData && sheetData.length > 0) {
            if (["Itens Válidos", "Itens Válidos Saídas", "Saídas", "Notas Válidas", "Imobilizados", "Devoluções de Compra (Fornecedor)", "Devoluções de Clientes", "Remessas e Retornos"].includes(name)) {
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
        resaleAnalysis: null,
        spedCorrections: null,
        reconciliationResults: null,
    };
}
```
- workspace/src/lib/xml-processor.ts:
```ts
"use client";

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

const EMPTY_XML_DATA: XmlData = {
    nfe: [],
    cte: [],
    itens: [],
    saidas: [],
    itensSaidas: [],
    canceledKeys: new Set(),
};


// =================================================================
// XML PARSING HELPERS
// =================================================================

const NFE_NAMESPACE = "http://www.portalfiscal.inf.br/nfe";
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
    const infCpl = getTagValue(infNFe, 'infCpl');
    
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
        'finNFe': getTagValue(ide, 'finNFe'), // Adicionando finNFe
        'infCpl': infCpl,
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
            'Código': getTagValue(prod, 'cProd'),
            'Descrição': getTagValue(prod, 'xProd'),
            'NCM': getTagValue(prod, 'NCM'),
            'CFOP': getTagValue(prod, 'CFOP'),
            'Unidade': getTagValue(prod, 'uCom'),
            'Quantidade': parseFloat(getTagValue(prod, 'qCom')) || 0,
            'Valor Unitário': parseFloat(getTagValue(prod, 'vUnCom')) || 0,
            'Valor Total': parseFloat(getTagValue(prod, 'vProd')) || 0,
        };

        if (imposto) {
            const icmsGroup = imposto.getElementsByTagNameNS(NFE_NAMESPACE, 'ICMS')[0];
            if (icmsGroup && icmsGroup.firstElementChild) {
                const cstTag = icmsGroup.firstElementChild.getElementsByTagNameNS(NFE_NAMESPACE, 'CST')[0];
                if (cstTag && cstTag.textContent) {
                    item['CST do ICMS'] = cstTag.textContent;
                } else {
                    const csosnTag = icmsGroup.firstElementChild.getElementsByTagNameNS(NFE_NAMESPACE, 'CSOSN')[0];
                    if (csosnTag && csosnTag.textContent) {
                         item['CST do ICMS'] = csosnTag.textContent;
                    }
                }
            }
        }

        itens.push(item);
    }
    
    if (isSaida) {
        return { saidas: [notaFiscal], itensSaidas: itens };
    } else {
        return { nfe: [notaFiscal], itens: itens };
    }
};

const parseCTe = (xmlDoc: XMLDocument, log: LogFunction): Partial<XmlData> | null => {
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
    const toma = infCte.getElementsByTagName('toma04')[0] || infCte.getElementsByTagName('toma4')[0] || infCte.getElementsByTagName('toma')[0]; // Tomador
    const vPrest = infCte.getElementsByTagName('vPrest')[0];

    if (!ide || !emit || !rem || !dest || !vPrest) {
        log("AVISO: Estrutura do XML CTe incompleta. Faltam tags filhas de <infCte> como ide, emit, rem, dest, ou vPrest.");
        return null;
    }
    
    const chaveAcesso = getAttributeValue(infCte, 'Id').replace('CTe', '');
    const nCT = getCteTagValue(ide, 'nCT');
    const serie = getCteTagValue(ide, 'serie');
    const dhEmiRaw = getCteTagValue(ide, 'dhEmi');
    const dhEmi = dhEmiRaw ? dhEmiRaw.substring(0, 10) : null;
    const emitCNPJ = getCteTagValue(emit, 'CNPJ');
    const emitIE = getCteTagValue(emit, 'IE');
    const vTPrest = getCteTagValue(vPrest, 'vTPrest');
    
    const status = getCteTagValue(infProt, 'cStat') === '100' ? 'Autorizadas' : 'Canceladas';

    let tomadorCnpj = '';
    if (toma) {
        tomadorCnpj = getCteTagValue(toma, 'CNPJ');
    }
    if (!tomadorCnpj) {
        // Fallback para o destinatário se o tomador não for encontrado
        tomadorCnpj = getCteTagValue(dest, 'CNPJ');
    }

    const notaCte = {
        'Chave de acesso': chaveAcesso,
        'Número': nCT,
        'Série': serie,
        'Emissão': dhEmi,
        'Fornecedor': getCteTagValue(emit, 'xNome'),
        'CPF/CNPJ do Fornecedor': emitCNPJ,
        'emitIE': emitIE,
        'Remetente': getCteTagValue(rem, 'xNome'),
        'CPF/CNPJ do Remetente': getCteTagValue(rem, 'CNPJ'),
        'Destinatário': getCteTagValue(dest, 'xNome'),
        'CPF/CNPJ do Destinatário': getCteTagValue(dest, 'CNPJ'),
        'tomadorCNPJ': tomadorCnpj, // Adicionando CNPJ do tomador
        'Valor da Prestação': parseFloat(vTPrest) || 0,
        'Status': status,
        'Chave Unica': cleanAndToStr(nCT) + cleanAndToStr(emitCNPJ),
    };

    return { cte: [notaCte] };
};

const parseEvent = (xmlDoc: XMLDocument, log: LogFunction): Partial<XmlData> | null => {
    const eventoList = xmlDoc.getElementsByTagNameNS(NFE_NAMESPACE, 'evento');
    if (eventoList.length === 0 || !eventoList[0]) return null;

    const infEvento = eventoList[0].getElementsByTagNameNS(NFE_NAMESPACE, 'infEvento')[0];
    if (!infEvento) return null;
    
    const tpEvento = getTagValue(infEvento, 'tpEvento');
    
    // Evento de Cancelamento: 110111
    if (tpEvento === '110111') {
        const chNFe = getTagValue(infEvento, 'chNFe');
        if (chNFe) {
            log(`INFO: Evento de cancelamento detectado para a chave: ${chNFe}`);
            return { canceledKeys: new Set([chNFe]) };
        }
    }
    
    // Outros eventos, como Carta de Correção (110110), são ignorados e não invalidam a nota.
    // O retorno nulo garante que a chave não seja adicionada ao conjunto de canceladas.
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

export const processUploadedXmls = async (files: File[]): Promise<XmlData> => {
    const combinedData: XmlData = {
        nfe: [], cte: [], itens: [], saidas: [], itensSaidas: [], canceledKeys: new Set()
    };

    if (files.length === 0) {
        return combinedData;
    }

    const parser = new DOMParser();

    for (const file of files) {
        try {
            const fileContent = await readFileAsText(file);
            const xmlDoc = parser.parseFromString(fileContent, "application/xml");
            
            const errorNode = xmlDoc.querySelector('parsererror');
            if (errorNode) {
                // Not logging parse errors as it's too verbose for the user
                continue;
            }

            let parsedResult: Partial<XmlData> | null = null;
            
            if (xmlDoc.getElementsByTagNameNS(NFE_NAMESPACE, 'procEventoNFe').length > 0 || xmlDoc.getElementsByTagName('procEventoCTe').length > 0) {
                // This is an event XML (like cancellation or correction letter)
                parsedResult = parseEvent(xmlDoc, () => {});
            } else if (xmlDoc.getElementsByTagNameNS(NFE_NAMESPACE, 'nfeProc').length > 0) {
                // This is a standard NFe
                parsedResult = parseNFe(xmlDoc, () => {});
            } else if (xmlDoc.getElementsByTagName('cteProc').length > 0) {
                // This is a standard CTe
                parsedResult = parseCTe(xmlDoc, () => {});
            }
            
            if(parsedResult) {
                // Merge results into combinedData
                combinedData.nfe.push(...(parsedResult.nfe || []));
                combinedData.cte.push(...(parsedResult.cte || []));
                combinedData.itens.push(...(parsedResult.itens || []));
                combinedData.saidas.push(...(parsedResult.saidas || []));
                combinedData.itensSaidas.push(...(parsedResult.itensSaidas || []));
                if (parsedResult.canceledKeys) {
                    parsedResult.canceledKeys.forEach(key => combinedData.canceledKeys.add(key));
                }
            }

        } catch (error: any) {
            console.error(`ERRO ao processar o ficheiro ${file.name}: ${error.message}`);
        }
    }
    
    return combinedData;
};
```
- workspace/src/pages/automator.tsx:
```tsx
import { AutomatorClientPage } from '@/components/app/automator/page-client';

export const dynamic = 'force-dynamic'

export default function AutomatorPage() {
  return <AutomatorClientPage />;
}
```