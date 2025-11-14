
import { cfopDescriptions } from './cfop';
import * as XLSX from 'xlsx';
import type { KeyCheckResult } from '@/components/app/key-checker';
import type { AllClassifications } from '@/components/app/imobilizado-analysis';
import { normalizeKey, cleanAndToStr } from './utils';

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

export function processDataFrames(dfs: DataFrames, eventCanceledKeys: Set<string>, log: LogFunction): Omit<ProcessedData, 'fileNames' | 'competence' | 'reconciliationResults' | 'siengeSheetData'> {
    
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
        "tomadorCNPJ": cleanAndToStr(row['CPF/CNPJ do Destinatário']) // Simplificando para tomador
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
            return { ...row, 'Descricao CFOP': 'N/A' };
        }
    
        const cfopCode = row['CFOP'] ? parseInt(cleanAndToStr(row['CFOP']), 10) : 0;
        const fullDescription = cfopDescriptions[cfopCode] || 'Descrição não encontrada';
        
        const newRow: { [key: string]: any } = {};
        let cfopAdded = false;
        
        for (const key in row) {
            newRow[key] = row[key];
            if (key === 'CFOP' && !cfopAdded) {
                newRow['Descricao CFOP'] = fullDescription;
                cfopAdded = true;
            }
        }
        if (!cfopAdded) {
            newRow['Descricao CFOP'] = fullDescription;
        }

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
            if (["Itens Válidos", "Itens Válidos Saídas", "Imobilizados", "Devoluções de Compra (Fornecedor)", "Devoluções de Clientes", "Remessas e Retornos", "Saídas", "Notas Válidas"].includes(name)) {
                 sheetData = sheetData.map(row => addCfopDescriptionToRow(row));
            }
            finalSheetSet[name] = sheetData;
        }
    });
    log("Processamento concluído. Resultados estão prontos para as próximas etapas.");

    return {
        sheets: finalSheetSet,
        spedInfo: null,
        keyCheckResults: null,
        resaleAnalysis: null,
        spedCorrections: null,
    };
}


export function runReconciliation(siengeData: any[] | null, allXmlItems: any[]): ReconciliationResults {
    const emptyResult = { reconciled: [], onlyInSienge: [], onlyInXml: [] };

    if (!siengeData || !allXmlItems || allXmlItems.length === 0) {
        return { ...emptyResult, onlyInSienge: siengeData || [], onlyInXml: allXmlItems || [] };
    }

    try {
        const findHeader = (data: any[], possibleNames: string[]): string | undefined => {
            if (!data[0]) return undefined;
            const headers = Object.keys(data[0]);
            return headers.find(h => possibleNames.some(p => normalizeKey(h) === normalizeKey(p)));
        };

        const h = {
            cnpj: findHeader(siengeData, ['cpf/cnpj', 'cpf/cnpj do fornecedor']),
            numero: findHeader(siengeData, ['número', 'numero', 'numero da nota', 'nota fiscal']),
            valorTotal: findHeader(siengeData, ['valor total', 'valor', 'vlr total']),
            cfop: findHeader(siengeData, ['cfop']),
            frete: findHeader(siengeData, ['frete']),
            desconto: findHeader(siengeData, ['desconto']),
            ipiDespesas: findHeader(siengeData, ['ipi despesas', 'ipidespesas']),
            icmsSt: findHeader(siengeData, ['icms-st', 'icms st', 'valor icms st', 'vlr icms st', 'vlr icms subst']),
            despesasAcessorias: findHeader(siengeData, ['despesas acessórias', 'despesasacessorias', 'voutro']),
            precoUnitario: findHeader(siengeData, ['preço unitário', 'preco unitario', 'valor unitario', 'vlr unitario']),
        };

        if (!h.numero || !h.cnpj) {
            throw new Error(`Colunas essenciais não encontradas: ${!h.numero ? 'Número da Nota' : ''} ${!h.cnpj ? 'CNPJ' : ''}`);
        }

        const createKey = (item: any, isXml: boolean): string => {
            const numero = isXml ? item['Número da Nota'] : item[h.numero!];
            const cnpj = isXml ? item['CPF/CNPJ do Emitente'] : item[h.cnpj!];
            return `${cleanAndToStr(numero)}-${cleanAndToStr(cnpj)}`;
        };

        const xmlMap = new Map<string, any[]>();
        allXmlItems.forEach(item => {
            const key = createKey(item, true);
            if (!xmlMap.has(key)) xmlMap.set(key, []);
            xmlMap.get(key)!.push({ ...item, __used: false });
        });

        const siengeMap = new Map<string, any[]>();
        siengeData.forEach(item => {
            const key = createKey(item, false);
            if (!siengeMap.has(key)) siengeMap.set(key, []);
            siengeMap.get(key)!.push({ ...item, __used: false });
        });

        const reconciled: any[] = [];
        
        const getSiengeValue = (siengeItem: any, key: keyof typeof h) => {
            const header = h[key];
            if (!header) return 0;
            const value = siengeItem[header];
            if (typeof value === 'number') return value;
            if (typeof value === 'string') return parseFloat(value.replace(',', '.')) || 0;
            return 0;
        };

        const comparisonFns = [
            (xml: any, sienge: any) => Math.abs(xml['Valor Total'] - getSiengeValue(sienge, 'valorTotal')) < 0.01,
            (xml: any, sienge: any) => Math.abs(xml['Valor Total'] - (getSiengeValue(sienge, 'valorTotal') - getSiengeValue(sienge, 'frete'))) < 0.01,
            (xml: any, sienge: any) => Math.abs(xml['Valor Total'] - (getSiengeValue(sienge, 'valorTotal') + getSiengeValue(sienge, 'desconto'))) < 0.01,
            (xml: any, sienge: any) => Math.abs(xml['Valor Total'] - (getSiengeValue(sienge, 'valorTotal') - getSiengeValue(sienge, 'ipiDespesas') - getSiengeValue(sienge, 'icmsSt'))) < 0.01,
            (xml: any, sienge: any) => Math.abs(xml['Valor Unitário'] - getSiengeValue(sienge, 'precoUnitario')) < 0.01,
        ];

        for (const [noteKey, siengeItems] of siengeMap.entries()) {
            const xmlItems = xmlMap.get(noteKey);
            if (!xmlItems) continue;

            for (const siengeItem of siengeItems) {
                if (siengeItem.__used) continue;

                for (const xmlItem of xmlItems) {
                    if (xmlItem.__used) continue;

                    for (const compare of comparisonFns) {
                        if (compare(xmlItem, siengeItem)) {
                            xmlItem.__used = true;
                            siengeItem.__used = true;
                            reconciled.push({ ...xmlItem, Sienge_CFOP: siengeItem[h.cfop!] });
                            break; 
                        }
                    }
                    if (siengeItem.__used) break; 
                }
            }
        }
        
        const onlyInSienge = Array.from(siengeMap.values()).flat().filter(item => !item.__used).map(({__used, ...rest}) => rest);
        const onlyInXml = Array.from(xmlMap.values()).flat().filter(item => !item.__used).map(({__used, ...rest}) => rest);

        return { reconciled, onlyInSienge, onlyInXml };

    } catch (err: any) {
        console.error("Reconciliation Error:", err.message);
        return { ...emptyResult, onlyInSienge: siengeData, onlyInXml: allXmlItems };
    }
}
