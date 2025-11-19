
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
    costCenterDebugKeys?: any[];
    siengeDebugKeys?: any[];
    allCostCenters?: string[];
    costCenterHeaderRows?: any[];
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

export function processDataFrames(dfs: DataFrames, eventCanceledKeys: Set<string>, log: LogFunction): Omit<ProcessedData, 'fileNames' | 'competence' | 'siengeSheetData' | 'reconciliationResults' | 'spedDuplicates' | 'spedCorrections' | 'resaleAnalysis' | 'costCenterMap' | 'costCenterDebugKeys' | 'siengeDebugKeys' | 'allCostCenters' | 'costCenterHeaderRows'> {
    
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


export function processCostCenterData(data: any[][]): { costCenterMap: Map<string, string>; debugKeys: any[]; allCostCenters: string[]; costCenterHeaderRows: any[] } {
    const costCenterMap = new Map<string, string>();
    const debugKeys: any[] = [];
    const costCenterSet = new Set<string>();
    const costCenterHeaderRows: any[] = [];
    let currentCostCenter = 'N/A';

    if (!data || data.length === 0) {
        return { costCenterMap, debugKeys, allCostCenters: [], costCenterHeaderRows: [] };
    }

    data.forEach(row => {
        if (!row || !Array.isArray(row)) return;
        
        let costCenterFoundInRow = false;
        
        for (let i = 0; i < row.length; i++) {
            const cellValue = String(row[i] || '').trim();
            if (cellValue.toLowerCase().includes('centro de custo')) {
                currentCostCenter = String(row[i + 1] || 'N/A').trim();
                costCenterSet.add(currentCostCenter);
                costCenterHeaderRows.push({
                    'Linha Original': row.join('; '),
                    'Centro de Custo Identificado': currentCostCenter
                });
                costCenterFoundInRow = true;
                break;
            }
        }

        if (!costCenterFoundInRow) {
            const itemNumberCell = String(row[0] || '').trim();
            
            if (/^\\d+$/.test(itemNumberCell)) {
                const creditorCell = String(row[1] || '').trim();
                const documentCell = String(row[3] || '').trim();

                const creditorCodeMatch = creditorCell.match(/^(\\d+)/);
                const creditorCode = creditorCodeMatch ? creditorCodeMatch[1] : '';

                if (documentCell && creditorCode) {
                    const docKey = `${cleanAndToStr(documentCell)}-${creditorCode}`;
                    
                    const debugInfo = { 
                        'Chave Gerada (Centro de Custo)': docKey, 
                        'Documento Original': documentCell, 
                        'Credor Original': creditorCell,
                        'Centro de Custo': currentCostCenter
                    };
                    debugKeys.push(debugInfo);

                    if (!costCenterMap.has(docKey)) {
                        costCenterMap.set(docKey, currentCostCenter);
                    }
                }
            }
        }
    });
    
    return { costCenterMap, debugKeys, allCostCenters: Array.from(costCenterSet), costCenterHeaderRows };
}


export function generateSiengeDebugKeys(siengeData: any[]): any[] {
    if (!siengeData || siengeData.length === 0) return [];
    
    const findHeader = (data: any[], possibleNames: string[]): string | undefined => {
        const headers = Object.keys(data[0] || {});
        return headers.find(h => possibleNames.some(p => normalizeKey(h) === normalizeKey(p)));
    };

    const h = {
        credor: findHeader(siengeData, ['credor', 'fornecedor', 'nome do fornecedor']),
        documento: findHeader(siengeData, ['documento', 'número', 'numero', 'numero da nota', 'nota fiscal']),
    };

    if (!h.credor || !h.documento) return [];

    return siengeData.map(item => {
        const credorString = item[h.credor!];
        const documento = item[h.documento!];
        
        const credorCodeMatch = String(credorString).match(/^(\\d+)/);
        const credorCode = credorCodeMatch ? credorCodeMatch[1] : '';

        const docKey = `${cleanAndToStr(documento)}-${credorCode}`;
        
        return {
            'Chave Gerada (Sienge)': docKey,
            'Documento Original': documento,
            'Credor Original': credorString,
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
            cnpj: findHeader(filteredSiengeData, ['cpf/cnpj', 'cpf/cnpj do fornecedor']),
            numero: findHeader(filteredSiengeData, ['número', 'numero', 'numero da nota', 'nota fiscal']),
            valorTotal: findHeader(filteredSiengeData, ['valor total', 'valor', 'vlr total']),
            credor: findHeader(filteredSiengeData, ['credor', 'fornecedor', 'nome do fornecedor']),
            cfop: findHeader(siengeData, ['cfop']),
            esp: findHeader(siengeData, ['esp']),
        };
        
        if (!h.cnpj || !h.numero || !h.valorTotal || !h.credor) {
            throw new Error("Não foi possível encontrar as colunas essenciais ('Número', 'CPF/CNPJ', 'Credor', 'Valor Total') na planilha Sienge.");
        }

        const getComparisonKey = (numero: any, cnpj: any, valor: any): string | null => {
            const cleanNumero = cleanAndToStr(numero);
            const cleanCnpj = String(cnpj).replace(/\D/g, '');
            const cleanValor = parseFloat(String(valor || '0').replace(',', '.')).toFixed(2);
            if (!cleanNumero || !cleanCnpj || cleanValor === 'NaN') return null;
            return `${cleanNumero}-${cleanCnpj}-${cleanValor}`;
        };

        let reconciled: any[] = [];
        let remainingXmlItems = [...enrichedXmlItems];
        let remainingSiengeItems = [...filteredSiengeData];

        const reconciliationPass = (
            siengeItems: any[],
            xmlItems: any[],
            getSiengeKey: (item: any) => string | null,
            getXmlKeyFn: (item: any) => string | null,
            passName: string
        ) => {
            const matchedInPass: any[] = [];
            const stillUnmatchedSienge: any[] = [];
            const xmlMap = new Map<string, any[]>();

            xmlItems.forEach(item => {
                const key = getXmlKeyFn(item);
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
                         if (costCenterMap && h.numero && h.credor) {
                            const siengeDoc = siengeItem[h.numero!];
                            const siengeCredorString = siengeItem[h.credor!];
                            
                            const credorCodeMatch = String(siengeCredorString).match(/^(\\d+)/);
                            const credorCode = credorCodeMatch ? credorCodeMatch[1] : '';

                            if (siengeDoc && credorCode) {
                                const docKey = `${cleanAndToStr(siengeDoc)}-${credorCode}`;
                                if (costCenterMap.has(docKey)) {
                                    costCenter = costCenterMap.get(docKey)!;
                                }
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

        // Pass 1: Valor Total
        let result = reconciliationPass(
            remainingSiengeItems,
            remainingXmlItems, 
            (item) => getComparisonKey(item[h.numero!], item[h.cnpj!], item[h.valorTotal!]),
            (item) => getComparisonKey(item['Número da Nota'], item['CPF/CNPJ do Emitente'], item['Valor Total']),
            "Valor Total"
        );
        reconciled.push(...result.matched);
        
        return { reconciled, onlyInSienge: result.remainingSienge, onlyInXml: result.remainingXml, debug: emptyResult.debug };
    } catch (err: any) {
        console.error("Reconciliation Error:", err);
        return { ...emptyResult, onlyInSienge: siengeData || [], onlyInXml: xmlItems };
    }
}
