
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
            // NF-e (C100)
            if (reg === 'C100' && parts.length > 9 && parts[9]?.length === 44) {
                key = parts[9];
                docData = { key, reg, indOper: parts[2], codPart: parts[4], dtDoc: parts[10], dtES: parts[11], vlDoc: parts[12], vlDesc: parts[14] };
            // CT-e (D100)
            } else if (reg === 'D100' && parts.length > 11 && parts[10]?.length === 44) {
                key = parts[10];
                 docData = { key, reg, indOper: parts[2], codPart: parts[4], dtDoc: parts[8], dtES: parts[9], vlDoc: parts[17] };
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
        let spedValue = parseFloat(String(spedDoc.vlDoc || '0').replace(',', '.'));
        
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
}


// Extracted display components to avoid re-declaration on render
const ModificationDisplay = ({ logs }: { logs: ModificationLog[] }) => (
    <ScrollArea className="h-full pr-4">
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
    <ScrollArea className="h-full pr-4">
        <div className="text-sm font-mono whitespace-pre-wrap space-y-2">
            {logs.map((log, index) => (
                <div key={index} className="p-2 rounded-md border bg-yellow-100 dark:bg-yellow-900/30">
                    <p><b>Removida (Linha {log.lineNumber}):</b> {log.line}</p>
                </div>
            ))}
        </div>
    </ScrollArea>
);


// Main Component
interface KeyCheckerProps {
    chavesValidas: any[];
    spedFiles: File[];
    onFilesChange: (files: File[]) => void;
    onSpedProcessed: (spedInfo: SpedInfo | null, keyCheckResults: KeyCheckResult | null, spedCorrections: SpedCorrectionResult | null) => void;
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

                const { keyCheckResults, spedInfo, error } = await checkSpedKeysInBrowser(chavesValidas, fileContents, logFn);
                setLogs(localLogs);
                
                if (error) {
                    throw new Error(error);
                }

                if (!keyCheckResults) {
                     throw new Error("Não foi possível extrair as chaves do arquivo SPED. Verifique o formato do arquivo.");
                }
                
                setResults(keyCheckResults);
                setSpedInfo(spedInfo);
                
                onSpedProcessed(spedInfo, keyCheckResults, null);
                
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
        onSpedProcessed(null, null, null);

        const spedInput = document.getElementById('sped-upload') as HTMLInputElement;
        if (spedInput) spedInput.value = "";
        
        toast({ title: "Verificação limpa", description: "Os resultados e o arquivo da verificação SPED foram removidos." });
    };

    const handleCorrectSped = useCallback(async () => {
        if (!spedFiles || spedFiles.length === 0) {
            toast({ variant: "destructive", title: "Arquivo faltando", description: "Por favor, carregue o arquivo SPED (.txt) primeiro." });
            setIsCorrectionModalOpen(false);
            return;
        }
        setIsCorrecting(true);
        setCorrectionResult(null);

        try {
            const fileContent = await readFileAsTextWithEncoding(spedFiles[0]);
            const result = processSpedFileInBrowser(fileContent, nfeEntradaData, cteData);
            setCorrectionResult(result);
            onSpedProcessed(spedInfo, results, result);
            toast({ title: "Correção Concluída", description: "O arquivo SPED foi analisado." });
        } catch (err: any) {
            const errorResult: SpedCorrectionResult = {
                fileName: `erro_sped.txt`,
                error: err.message,
                linesRead: 0,
                linesModified: 0,
                modifications: { truncation: [], unitStandardization: [], removed0190: [], addressSpaces: [], ieCorrection: [], cteSeriesCorrection: [], count9900: [], blockCount: [], totalLineCount: [] },
                log: [`ERRO FATAL: ${err.message}`]
            };
            setCorrectionResult(errorResult);
            onSpedProcessed(spedInfo, results, errorResult);
            toast({ variant: "destructive", title: "Erro na correção", description: err.message });
        } finally {
            setIsCorrecting(false);
        }
    }, [spedFiles, nfeEntradaData, cteData, onSpedProcessed, spedInfo, results, toast]);

    useEffect(() => {
        if (isCorrectionModalOpen) {
            handleCorrectSped();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isCorrectionModalOpen]);


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
        
        // Use a timeout to ensure the link is removed after the browser has processed the click
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
    };
    
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text).then(() => {
            toast({ title: "Copiado", description: "O erro foi copiado para a área de transferência." });
        }).catch(() => {
            toast({ variant: 'destructive', title: `Falha ao copiar` });
        });
    };

    const modificationTabs: {
        id: keyof SpedCorrectionResult['modifications'];
        title: string;
        description: string;
    }[] = [
        { id: 'count9900', title: 'Contadores', description: 'A contagem de linhas em cada bloco (registos x990) e a contagem total (9999) foram recalculadas para corresponder ao número real de linhas no ficheiro.' },
        { id: 'ieCorrection', title: 'IE (NF-e)', description: 'A Inscrição Estadual (IE) de participantes (registo 0150) foi corrigida com base nos dados dos XMLs para garantir a conformidade.' },
        { id: 'cteSeriesCorrection', title: 'Série (CT-e)', description: 'A série de CT-es (registo D100) foi corrigida com base nos dados dos XMLs de CTe para corresponder à série original.' },
        { id: 'addressSpaces', title: 'Endereços', description: 'Espaços múltiplos no campo de complemento do endereço (registo 0150) foram substituídos por um único espaço para evitar erros de formatação.' },
        { id: 'truncation', title: 'Truncamento', description: 'Campos de texto livre (ex: observações nos registos 0450, 0460, C110) foram limitados a 235 caracteres para evitar erros de importação.' },
        { id: 'unitStandardization', title: 'Unidades', description: 'Unidades de medida de produtos (registos 0200, C170) foram padronizadas para \'un\' para manter a consistência e evitar erros.' },
        { id: 'removed0190', title: '0190 Removidos', description: 'Registos do tipo \'0190\' desnecessários (todos exceto \'un\' e \'pc\') foram removidos para limpar o ficheiro e evitar potenciais problemas.' },
    ];
    
    // Agrupa as correções de contador para exibição
    const groupedCounterModifications = correctionResult ? [...correctionResult.modifications.blockCount, ...correctionResult.modifications.totalLineCount, ...correctionResult.modifications.count9900] : [];


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
                                <Button variant="secondary" className="w-full">
                                    Corrigir e Baixar Arquivo SPED
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
                                            <Tabs defaultValue={modificationTabs[0].id} className="flex flex-col h-full">
                                                <TabsList className="h-auto flex-wrap justify-start">
                                                    <TabsTrigger value="count9900">Contadores ({groupedCounterModifications.length})</TabsTrigger>
                                                    {modificationTabs.filter(tab => tab.id !== 'count9900').map(tab => (
                                                        <TabsTrigger key={tab.id} value={tab.id}>{tab.title} ({(correctionResult.modifications[tab.id] as any[]).length})</TabsTrigger>
                                                    ))}
                                                </TabsList>
                                                <div className="flex-grow overflow-hidden mt-2">
                                                    <TabsContent value="count9900" className="h-full">
                                                        <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded-md mb-2 flex items-center gap-2">
                                                            <TooltipProvider><Tooltip><TooltipTrigger asChild><button><HelpCircle className="h-4 w-4"/></button></TooltipTrigger><TooltipContent><p>{modificationTabs.find(t => t.id === 'count9900')?.description}</p></TooltipContent></Tooltip></TooltipProvider>
                                                            <span>A contagem de linhas de cada bloco e do ficheiro foi recalculada.</span>
                                                        </div>
                                                        <ModificationDisplay logs={groupedCounterModifications} />
                                                    </TabsContent>
                                                    
                                                    {modificationTabs.filter(tab => tab.id !== 'count9900').map(tab => (
                                                        <TabsContent key={tab.id} value={tab.id} className="h-full">
                                                            <div className="text-xs text-muted-foreground p-2 bg-muted/50 rounded-md mb-2 flex items-center gap-2">
                                                                <TooltipProvider><Tooltip><TooltipTrigger asChild><button><HelpCircle className="h-4 w-4"/></button></TooltipTrigger><TooltipContent><p>{tab.description}</p></TooltipContent></Tooltip></TooltipProvider>
                                                                <span>{tab.description}</span>
                                                            </div>
                                                            {tab.id === 'removed0190' ? (
                                                                <RemovedLinesDisplay logs={correctionResult.modifications[tab.id]} />
                                                            ) : (
                                                                <ModificationDisplay logs={correctionResult.modifications[tab.id]} />
                                                            )}
                                                        </TabsContent>
                                                    ))}
                                                </div>
                                            </Tabs>
                                        </TabsContent>

                                        <TabsContent value="full_log" className="mt-4 flex-grow overflow-hidden">
                                            <div className="h-full overflow-y-auto">
                                                <LogDisplay logs={correctionResult.log} />
                                            </div>
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

    