
import { cfopDescriptions } from './cfop';
import * as XLSX from 'xlsx';
import type { KeyCheckResult } from '@/components/app/key-checker';
import type { AllClassifications } from '@/components/app/imobilizado-analysis';
import { normalizeKey, cleanAndToStr } from './utils';
import type { SpedDuplicate } from './types';


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
export interface ReconciliationResults {
    reconciled: any[];
    onlyInSienge: any[];
    onlyInXml: any[];
    debug: {
        costCenterKeys: any[];
        siengeKeys: any[];
    }
}
export interface ProcessedData {
    sheets: DataFrames;
    spedInfo: SpedInfo | null;
    siengeSheetData: any[] | null;
    keyCheckResults: KeyCheckResult | null;
    saidasStatus?: Record<string, 'emitida' | 'cancelada' | 'inutilizada'>;
    lastSaidaNumber?: number;
    imobilizadoClassifications?: AllClassifications;
    competence: string | null;
    reconciliationResults: ReconciliationResults | null;
    resaleAnalysis?: { noteKeys: Set<string>; xmls: File[] } | null;
    spedCorrections?: SpedCorrectionResult[] | null;
    spedDuplicates?: SpedDuplicate[] | null;
    costCenterMap?: Map<string, string>;
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

const addChaveUnica = (df: DataFrame): DataFrame => {
    if (!df || df.length === 0 || !df[0]) return df;
    
    const findKey = (possibleNames: string[]) => Object.keys(df[0]).find(k => possibleNames.includes(normalizeKey(k)));

    const numeroKey = findKey(['número', 'numero']);
    const emitenteCnpjKey = findKey(['cpf/cnpj do fornecedor', 'emitcnpj']);
    
    if (!numeroKey) return df;

    return df.map(row => {
        if(row && typeof row === 'object' && numeroKey in row) {
            const numeroLimpo = cleanAndToStr(row[numeroKey]);
            let parceiroCnpjLimpo = '';
            
             if (emitenteCnpjKey && row[emitenteCnpjKey]) {
                parceiroCnpjLimpo = cleanAndToStr(row[emitenteCnpjKey]);
            }
            
            const chaveUnica = `${numeroLimpo}-${parceiroCnpjLimpo}`;
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

export function processDataFrames(dfs: DataFrames, eventCanceledKeys: Set<string>, log: LogFunction): Omit<ProcessedData, 'fileNames' | 'competence' | 'siengeSheetData' | 'reconciliationResults' | 'spedDuplicates' | 'spedCorrections' | 'resaleAnalysis' | 'costCenterMap'> {
    
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
        const chaveUnica = item["Chave Unica"];
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
            const notaItens = itensMap.get(nota["Chave Unica"]) || [];
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
    
    const chavesNotasValidas = new Set(notasValidas.map(row => row["Chave Unica"]));
    let itensValidos = itens.filter(item => chavesNotasValidas.has(item["Chave Unica"]));
    log(`- ${itensValidos.length} itens válidos de entrada correspondentes.`);

    let saidasValidas = saidas.filter(row => !chavesExcecao.has(cleanAndToStr(row['Chave de acesso'])));
    log(`- ${saidasValidas.length} saídas válidas encontradas.`);
    const chavesSaidasValidas = new Set(saidasValidas.map(row => row["Chave Unica"]));
    const itensValidosSaidas = itensSaidas.filter(item => chavesSaidasValidas.has(item["Chave Unica"]));
    log(`- ${itensValidosSaidas.length} itens de saída válidos correspondentes.`);
    
    log("Identificando itens para análise de imobilizado a partir dos itens válidos...");
    const nfeHeaderMap = new Map(notasValidas.map(n => [n['Chave Unica'], n]));
    const imobilizados = itensValidos
        .filter(item => {
            if (!item || !item['Valor Unitário']) return false;
            return parseFloat(String(item['Valor Unitário'])) > 1200;
        }).map((item) => {
            const uniqueItemId = `${cleanAndToStr(item['CPF/CNPJ do Emitente'])}-${cleanAndToStr(item['Código'])}`;
            const id = `${item['Chave Unica']}-${item['Item']}`;
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
        "tomadorCNPJ": cleanAndToStr(row['CPF/CNPJ do Destinatário']), // Simplificando para tomador
        "recebCNPJ": cleanAndToStr(row.recebCNPJ),
        "recebUF": row.recebUF,
        "recebIE": row.recebIE
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
        if (!row || typeof row !== 'object') {
            return { ...row };
        }
    
        const newRow = { ...row }; // Create a shallow copy to avoid mutating the original object.
        const cfopCode = newRow['CFOP'] ? parseInt(cleanAndToStr(newRow['CFOP']), 10) : 0;
        const fullDescription = cfopDescriptions[cfopCode] || 'Descrição não encontrada';
    
        newRow['Descricao CFOP'] = fullDescription;
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
            sheetData = sheetData.map(addCfopDescriptionToRow);
            finalSheetSet[name] = sheetData;
        }
    });
    log("Processamento concluído. Resultados estão prontos para as próximas etapas.");

    return {
        sheets: finalSheetSet,
        spedInfo: null,
        keyCheckResults: null,
    };
}

/**
 * Processa a planilha de centro de custo para criar um mapa de busca rápida e chaves de depuração.
 * @param data - Os dados brutos da planilha, lidos como um array de arrays.
 * @returns Um objeto contendo o mapa de centros de custo e uma lista de chaves de depuração.
 */
export function processCostCenterData(data: any[][]): { costCenterMap: Map<string, string>; debugKeys: any[] } {
    const costCenterMap = new Map<string, string>();
    const debugKeys: any[] = [];
    let currentCostCenter = 'N/A';

    if (!data || data.length === 0) {
        return { costCenterMap, debugKeys };
    }

    let headerRowIndex = data.findIndex(row => String(row[0]).trim().toLowerCase().startsWith('item'));
    if (headerRowIndex === -1) {
        headerRowIndex = data.findIndex(row => String(row[1]).trim().toLowerCase().startsWith('credor'));
        if (headerRowIndex === -1) return { costCenterMap, debugKeys }; // Se não encontrar, retorna vazio sem erro.
    }
    
    const headers: string[] = data[headerRowIndex].map(h => String(h).trim());
    const credorIndex = headers.findIndex(h => normalizeKey(h) === 'credor');
    const documentoIndex = headers.findIndex(h => normalizeKey(h) === 'documento');

    if (credorIndex === -1 || documentoIndex === -1) {
        return { costCenterMap, debugKeys }; // Colunas não encontradas.
    }

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        const firstCell = String(row[0]).trim();
        if (firstCell.toLowerCase() === 'centro de custo') {
            currentCostCenter = String(row[1]).trim();
            continue;
        }

        if (i > headerRowIndex && /^\d+$/.test(firstCell)) {
            const credorString = String(row[credorIndex]).trim();
            const documento = String(row[documentoIndex]).trim();

            if (credorString && documento) {
                const credorName = credorString.replace(/^\d+\s*-\s*/, '').replace(/\s*-\s*[\d-]+$/, '').trim();
                const docKey = `${cleanAndToStr(documento)}-${normalizeKey(credorName)}`;
                
                debugKeys.push({ 'Chave Gerada (Centro de Custo)': docKey, 'Documento Original': documento, 'Credor Original': credorString, 'Centro de Custo': currentCostCenter });
                if (!costCenterMap.has(docKey)) {
                    costCenterMap.set(docKey, currentCostCenter);
                }
            }
        }
    }
    return { costCenterMap, debugKeys };
}

export function generateSiengeDebugKeys(siengeData: any[]): any[] {
    if (!siengeData || siengeData.length === 0) return [];
    
    const findHeader = (data: any[], possibleNames: string[]): string | undefined => {
        const headers = Object.keys(data[0] || {});
        return headers.find(h => possibleNames.some(p => normalizeKey(h) === normalizeKey(p)));
    };

    const h = {
        credor: findHeader(siengeData, ['credor', 'fornecedor']),
        documento: findHeader(siengeData, ['documento', 'número', 'numero', 'numero da nota', 'nota fiscal']),
    };

    if (!h.credor || !h.documento) return [];

    return siengeData.map(item => {
        const credorName = item[h.credor!];
        const documento = item[h.documento!];
        const docKey = `${cleanAndToStr(documento)}-${normalizeKey(credorName)}`;
        return {
            'Chave Gerada (Sienge)': docKey,
            'Documento Original': documento,
            'Credor Original': credorName,
        };
    });
}


export function runReconciliation(
    siengeData: any[] | null, 
    xmlItems: any[],
    nfeEntradas: any[],
    cteData: any[],
    costCenterMap?: Map<string, string> | null
): ReconciliationResults {
    const emptyResult = { reconciled: [], onlyInSienge: [], onlyInXml: [], debug: { costCenterKeys: [], siengeKeys: [] } };
    if (!siengeData || siengeData.length === 0) {
        return { ...emptyResult, onlyInXml: xmlItems || [] };
    }

    if (!xmlItems || xmlItems.length === 0) {
         return { ...emptyResult, onlyInSienge: siengeData };
    }
    
    // As chaves de depuração agora são geradas fora e passadas para cá
    const siengeDebugKeys = generateSiengeDebugKeys(siengeData);
    const { costCenterMap: internalCostCenterMap, debugKeys: costCenterKeys } = processCostCenterData(siengeData);
    const finalCostCenterMap = costCenterMap || internalCostCenterMap;


    try {
        const findHeader = (data: any[], possibleNames: string[]): string | undefined => {
            if (!data || data.length === 0 || !data[0]) return undefined;
            const headers = Object.keys(data[0]);
            return headers.find(h => possibleNames.some(p => normalizeKey(h) === normalizeKey(p)));
        };

        const espHeader = findHeader(siengeData, ['esp']);
        if (!espHeader) {
            throw new Error("Não foi possível encontrar a coluna 'Esp' na planilha Sienge para filtragem.");
        }
        
        const nfeHeaderMap = new Map();
        [...(nfeEntradas || []), ...(cteData || [])].forEach(n => nfeHeaderMap.set(n['Chave Unica'], n));

        const enrichedXmlItems = xmlItems.map(item => {
            const header = nfeHeaderMap.get(item['Chave Unica']);
            return {
                ...item,
                Fornecedor: header?.Fornecedor || 'N/A',
                destUF: header?.destUF || '',
            };
        });

        const filteredSiengeData = siengeData.filter(row => {
            const espValue = row[espHeader] ? String(row[espHeader]).trim().toUpperCase() : '';
            return espValue === 'NFE' || espValue === 'NFSR' || espValue === 'CTE';
        });


        const h = {
            credor: findHeader(filteredSiengeData, ['credor', 'fornecedor', 'nome do fornecedor']),
            documento: findHeader(filteredSiengeData, ['documento', 'número', 'numero', 'numero da nota', 'nota fiscal']),
            cfop: findHeader(siengeData, ['cfop']),
            esp: findHeader(siengeData, ['esp']),
            valorTotal: findHeader(filteredSiengeData, ['valor total', 'valor', 'vlr total']),
        };
        
        if (!h.credor || !h.documento || !h.valorTotal) {
            throw new Error("Não foi possível encontrar as colunas essenciais ('Credor', 'Documento', 'Valor Total') na planilha Sienge.");
        }
        
        const getSiengeKey = (item: any) => {
            const doc = item[h.documento!];
            const credor = item[h.credor!];
            if (!doc || !credor) return null;
            return `${cleanAndToStr(doc)}-${normalizeKey(credor)}`;
        };
        
        const getXmlKey = (item: any) => {
             const doc = item['Número da Nota'];
             const credor = item['Fornecedor'];
             if (!doc || !credor) return null;
            return `${cleanAndToStr(doc)}-${normalizeKey(credor)}`;
        };

        let reconciled: any[] = [];
        let remainingXmlItems = [...enrichedXmlItems];
        let remainingSiengeItems = [...filteredSiengeData];

        const reconciliationPass = (
            siengeItems: any[],
            xmlItems: any[],
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
                        const matchedXmlItem = matchedXmlItems.shift(); 
                        if (matchedXmlItems.length === 0) xmlMap.delete(key);
                        
                        let costCenter = 'N/A';
                         if (finalCostCenterMap && h.documento && h.credor) {
                            const docKey = `${cleanAndToStr(siengeItem[h.documento!])}-${normalizeKey(siengeItem[h.credor!])}`;
                            if (finalCostCenterMap.has(docKey)) {
                                costCenter = finalCostCenterMap.get(docKey)!;
                            }
                        }

                        matchedInPass.push({ 
                            ...matchedXmlItem, 
                            Sienge_CFOP: siengeItem[h.cfop!],
                            Sienge_Esp: siengeItem[h.esp!],
                            'Centro de Custo': costCenter,
                            'Observações': `Conciliado via ${passName}` 
                        });
                        return;
                    }
                }
                stillUnmatchedSienge.push(siengeItem);
            });
            
            const stillUnmatchedXml = Array.from(xmlMap.values()).flat();
            return { matched: matchedInPass, remainingSienge: stillUnmatchedSienge, remainingXml: stillUnmatchedXml };
        };

        // Apenas uma passagem é necessária com a chave refinada
        const result = reconciliationPass(remainingSiengeItems, remainingXmlItems, "Documento + Credor");
        reconciled.push(...result.matched);
        remainingSiengeItems = result.remainingSienge;
        remainingXmlItems = result.remainingXml;
        
        return { reconciled, onlyInSienge: remainingSiengeItems, onlyInXml: remainingXmlItems, debug: { costCenterKeys, siengeKeys } };
    } catch (err: any) {
        console.error("Reconciliation Error:", err);
        return { ...emptyResult, onlyInSienge: siengeData || [], onlyInXml: xmlItems };
    }
}
    
