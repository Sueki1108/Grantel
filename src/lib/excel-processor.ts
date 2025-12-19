
import { cfopDescriptions } from './cfop';
import type { KeyCheckResult } from '@/components/app/key-checker';
import type { AllClassifications } from '@/lib/types';
import { normalizeKey, cleanAndToStr } from './utils';
import type { SpedDuplicate, SaidaItem } from './types';
import * as XLSX from 'xlsx';


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
    devolucoesEP: any[];
    otherSiengeItems: { [esp: string]: any[] };
    debug: {
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
    costCenterMap: Map<string, string> | null;
    siengeDebugKeys?: any[];
    costCenterDebugKeys?: any[];
    allCostCenters?: string[];
    costCenterHeaderRows?: any[][];
    accountingMap: Map<string, { account: string; description: string }> | null;
    payableAccountingDebugKeys?: any[];
    paidAccountingDebugKeys?: any[];
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
    const emitenteCnpjKey = findKey(['cpf/cnpj do fornecedor', 'emitcnpj', 'cpf/cnpj do emitente']);
    
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

export function processDataFrames(
    dfs: DataFrames, 
    eventCanceledKeys: Set<string>, 
    log: LogFunction
): Omit<ProcessedData, 'fileNames' | 'competence' | 'costCenterMap' | 'costCenterDebugKeys' | 'allCostCenters' | 'costCenterHeaderRows' | 'accountingMap' | 'payableAccountingDebugKeys' | 'paidAccountingDebugKeys' | 'siengeSheetData' | 'siengeDebugKeys' | 'resaleAnalysis' | 'reconciliationResults' > {
    
    log("Iniciando preparação dos dados no navegador...");
    const GRANTEL_CNPJ = "81732042000119";
    const originalDfs: DataFrames = {};
    const processedDfs: DataFrames = {};

    const allSheetNames = [
        "NFE", "CTE", "Itens", "Saídas", "Itens Saídas",
        "NFE Operação Não Realizada", "NFE Operação Desconhecida", 
        "CTE Desacordo de Serviço", "Itens do Sienge"
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

    log("Coletando chaves de exceção (canceladas, manifesto)...");
    const chavesExcecao = new Set<string>(eventCanceledKeys);
    log(`- ${eventCanceledKeys.size} chaves de cancelamento por evento de XML adicionadas.`);
    
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

    const notasValidas: any[] = [];
    const devolucoesDeCompra: any[] = []; 
    const devolucoesDeClientes: any[] = []; 
    const remessasEretornos: any[] = []; 

    const allNfeAndCte = [...nfe, ...cte];

    const itensMap = new Map<string, any[]>();
    itens.forEach(item => {
        const chaveUnica = item["Chave Unica"];
        if (!itensMap.has(chaveUnica)) {
            itensMap.set(chaveUnica, []);
        }
        itensMap.get(chaveUnica)!.push(item);
    });

    allNfeAndCte.forEach(nota => {
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
            const isDevolucaoCliente = nota.finNFe === '4' || notaItens.some(item => {
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
    log(`- Total de ${devolucoesDeClientes.length} devoluções de clientes (CFOP 1xxx/2xxx ou finNFe=4) identificadas.`);
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
            const header = nfeHeaderMap.get(item['Chave Unica']);
            const emitenteCnpj = header?.['CPF/CNPJ do Fornecedor'] || item['CPF/CNPJ do Emitente'] || '';
            const codigoProduto = item['Código'] || '';

            return {
                ...item,
                id: `${item['Chave Unica'] || ''}-${item['Item'] || ''}`,
                uniqueItemId: `${cleanAndToStr(emitenteCnpj)}-${cleanAndToStr(codigoProduto)}`,
                Fornecedor: header?.Fornecedor || 'N/A',
                'CPF/CNPJ do Emitente': emitenteCnpj,
                destUF: header?.destUF || '',
                'Alíq. ICMS (%)': item['Alíq. ICMS (%)'] === undefined ? null : item['Alíq. ICMS (%)']
            };
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
        "tomadorCNPJ": cleanAndToStr(row['tomadorCNPJ']),
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
    
    const sheets: DataFrames = {
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
    
        const newRow: { [key: string]: any } = { ...row };
        let cfopCodeStr = newRow['CFOP'];
    
        if (!cfopCodeStr && newRow['Chave Unica']) {
            const allItems = [...itens, ...itensSaidas];
            const relatedItem = allItems.find(item => item['Chave Unica'] === newRow['Chave Unica'] && item['CFOP']);
            if (relatedItem) {
                cfopCodeStr = relatedItem['CFOP'];
            }
        }
    
        const cfopCode = cfopCodeStr ? parseInt(cleanAndToStr(cfopCodeStr), 10) : 0;
        newRow['Descricao CFOP'] = cfopDescriptions[cfopCode] || 'Descrição não encontrada';
        
        return newRow;
    };
    
    const finalSheetSet: DataFrames = {};
    const displayOrder = [
        "Notas Válidas", "Itens Válidos", "Chaves Válidas", "Saídas", "Itens Válidos Saídas",
        "Imobilizados", "Devoluções de Compra (Fornecedor)", "Devoluções de Clientes", "Remessas e Retornos",
        "Notas Canceladas", ...Object.keys(originalDfs)
    ];

    displayOrder.forEach(name => {
        let sheetData = sheets[name];
        if (sheetData && sheetData.length > 0) {
            finalSheetSet[name] = sheetData.map(addCfopDescriptionToRow);
        }
    });
    log("Processamento primário concluído.");
    
    return {
        sheets: finalSheetSet,
        spedInfo: null,
        keyCheckResults: null,
        spedCorrections: null,
        spedDuplicates: null,
    };
}

export function runReconciliation(
    siengeData: any[],
    xmlItems: any[],
    nfeEntradas: any[],
    cteData: any[],
    costCenterMap?: Map<string, string> | null,
    accountingMap?: Map<string, { account: string; description: string }> | null,
): ReconciliationResults {
    const emptyResult = { reconciled: [], onlyInSienge: [], onlyInXml: xmlItems, devolucoesEP: [], otherSiengeItems: {}, debug: { siengeKeys: [] } };

    if (!siengeData || siengeData.length === 0) {
        return { ...emptyResult, onlyInXml: xmlItems };
    }

    const findHeader = (data: any[], possibleNames: string[]): string | undefined => {
        if (!data || data.length === 0 || !data[0]) return undefined;
        const headers = Object.keys(data[0]);
        return headers.find(h => possibleNames.some(p => normalizeKey(h) === normalizeKey(p)));
    };
    
    const h = {
        esp: findHeader(siengeData, ['esp', 'especie']),
        documento: findHeader(siengeData, ['documento', 'número', 'numero', 'numerodanota', 'notafiscal']),
        credor: findHeader(siengeData, ['credor', 'fornecedor']),
        cnpj: findHeader(siengeData, ['cpf/cnpj', 'cpf/cnpj do fornecedor', 'cnpj']),
        valor: findHeader(siengeData, ['valor', 'valortotal', 'vlr total']),
        cfop: findHeader(siengeData, ['cfop']),
        produtoFiscal: findHeader(siengeData, ['produto fiscal', 'descrição do item', 'descrição']),
    };

    if (!h.documento || !h.cnpj || !h.valor) {
        throw new Error("Não foi possível encontrar as colunas essenciais ('Documento', 'CPF/CNPJ', 'Valor') na planilha Sienge.");
    }
    
    const siengeToReconcile = h.esp 
        ? siengeData.filter(row => ['NFE', 'NFSR', 'CTE'].includes(String(row[h.esp!]).toUpperCase()))
        : siengeData;
    
    const otherSiengeItemsRaw = h.esp
        ? siengeData.filter(row => !['NFE', 'NFSR', 'CTE'].includes(String(row[h.esp!]).toUpperCase()))
        : [];
    
    const getXmlDocKey = (item: any) => item['Número da Nota'] || item['Número'];
    const getXmlCnpjKey = (item: any) => item['CPF/CNPJ do Emitente'] || item['CPF/CNPJ do Fornecedor'];

    const reconciliationPass = (siengeItems: any[], xmlItems: any[], getSiengeKey: (item: any) => string | null, getXmlKey: (item: any) => string | null, passName: string) => {
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
                    const matchedXmlItem = matchedXmlItems.shift()!;
                    const combined = { ...matchedXmlItem, ...Object.fromEntries(Object.entries(siengeItem).map(([k, v]) => [`Sienge_${k}`, v])), 'Observações': `Conciliado via ${passName}`};
                    matchedInPass.push(combined);
                    return;
                }
            }
            stillUnmatchedSienge.push(siengeItem);
        });

        const stillUnmatchedXml = Array.from(xmlMap.values()).flat();
        return { matched: matchedInPass, remainingSienge: stillUnmatchedSienge, remainingXml: stillUnmatchedXml };
    };

    let reconciled: any[] = [];
    let remainingXml = [...xmlItems, ...cteData];
    let remainingSienge = [...siengeToReconcile];

    const createComparisonKey = (docNum: any, cnpj: any, value: any): string | null => {
        const cleanDoc = cleanAndToStr(docNum);
        const cleanCnpj = cleanAndToStr(cnpj);
        const cleanValue = (value !== null && value !== undefined) ? parseFloat(String(value).replace(',', '.')).toFixed(2) : '0.00';
        if (!cleanDoc || !cleanCnpj || cleanValue === 'NaN') return null;
        return `${cleanDoc}-${cleanCnpj}-${cleanValue}`;
    };

    const passes = [
        { name: 'Valor Total', siengeKey: (item: any) => createComparisonKey(item[h.documento!], item[h.cnpj!], item[h.valor!]), xmlKey: (item: any) => createComparisonKey(getXmlDocKey(item), getXmlCnpjKey(item), item['Valor Total'] || item['Valor da Prestação']) },
        { name: 'Preço Unitário', siengeKey: (item: any) => createComparisonKey(item[h.documento!], item[h.cnpj!], item.precoUnitario), xmlKey: (item: any) => createComparisonKey(getXmlDocKey(item), getXmlCnpjKey(item), item['Valor Unitário']) },
        { name: 'ICMS Outras', siengeKey: (item: any) => createComparisonKey(item[h.documento!], item[h.cnpj!], item.icmsOutras), xmlKey: (item: any) => createComparisonKey(getXmlDocKey(item), getXmlCnpjKey(item), item['Valor Total'] || item['Valor da Prestação']) },
        { name: 'Valor Total + Desconto', siengeKey: (item: any) => createComparisonKey(item[h.documento!], item[h.cnpj!], parseFloat(String(item[h.valor!] || '0').replace(',', '.')) + parseFloat(String(item.desconto || '0').replace(',', '.'))), xmlKey: (item: any) => createComparisonKey(getXmlDocKey(item), getXmlCnpjKey(item), item['Valor Total'] || item['Valor da Prestação'])},
        { name: 'Valor Total - Frete', siengeKey: (item: any) => createComparisonKey(item[h.documento!], item[h.cnpj!], parseFloat(String(item[h.valor!] || '0').replace(',', '.')) - parseFloat(String(item.frete || '0').replace(',', '.'))), xmlKey: (item: any) => createComparisonKey(getXmlDocKey(item), getXmlCnpjKey(item), item['Valor Total'] || item['Valor da Prestação'])},
    ];

    for (const pass of passes) {
        if(remainingSienge.length === 0 || remainingXml.length === 0) break;
        const result = reconciliationPass(remainingSienge, remainingXml, pass.siengeKey, pass.xmlKey, pass.name);
        reconciled.push(...result.matched);
        remainingSienge = result.remainingSienge;
        remainingXml = result.remainingXml;
    }


    const enrichItem = (item: any) => {
        if (!item || typeof item !== 'object') return { ...item, 'Centro de Custo': 'N/A', 'Contabilização': 'N/A' };
        const siengeDocNumberRaw = item[`Sienge_${h.documento!}`];
        const siengeCredorRaw = item[`Sienge_${h.credor!}`];
        if (siengeDocNumberRaw && siengeCredorRaw) {
            const docNumberClean = cleanAndToStr(siengeDocNumberRaw);
            const credorCodeMatch = String(siengeCredorRaw).match(/^(\d+)\s*-/);
            const credorCode = credorCodeMatch ? credorCodeMatch[1] : '';
            const costCenterKey = `${docNumberClean}-${credorCode}`;
            if (costCenterMap) {
                item['Centro de Custo'] = costCenterMap.get(costCenterKey) || 'N/A';
            } else {
                 item['Centro de Custo'] = 'N/A';
            }
            
            const accountingKey = `${docNumberClean}-${siengeCredorRaw}`;
            if (accountingMap) {
                const accInfo = accountingMap.get(accountingKey);
                item['Contabilização'] = accInfo ? `${accInfo.account} - ${accInfo.description}` : 'N/A';
            } else {
                 item['Contabilização'] = 'N/A';
            }
        } else {
            item['Centro de Custo'] = 'N/A'; item['Contabilização'] = 'N/A';
        }
        item['CFOP (Sienge)'] = (h.cfop && item[`Sienge_${h.cfop}`]) || 'N/A';
        return item;
    };
    
    // Devoluções EP: Itens de Saída cuja natureza da operação é devolução
    const devolucoesEP = (nfeEntradas || []).filter(item => {
        const natOp = (item['Natureza da Operação'] || '').toUpperCase();
        return natOp.includes('DEVOLUCAO');
    }).map(item => ({
        'Número da Nota de Devolução': item['Número'],
        'Fornecedor': item.Fornecedor,
        'Valor': item['Total'],
        'Data Emissão': item.Emissão,
        'Chave da Nota Original': cleanAndToStr(item['refNFe']) || 'Não encontrada no XML',
    }));
        
    return { 
        reconciled: reconciled.map(enrichItem), 
        onlyInSienge: remainingSienge.map(enrichItem), 
        onlyInXml: remainingXml.map(enrichItem),
        devolucoesEP, 
        otherSiengeItems: Object.entries(otherSiengeItemsRaw.reduce((acc, item) => {
            const esp = item[h.esp!] || 'Sem Tipo';
            if(!acc[esp]) acc[esp] = [];
            acc[esp].push(enrichItem(item));
            return acc;
        }, {} as {[esp: string]: any[]})).reduce((acc, [key, value]) => ({...acc, [key]: value}), {}),
        debug: { siengeKeys: [] } 
    };
}

export function generateSiengeDebugKeys(siengeData: any[]) {
    const findHeader = (data: any[], possibleNames: string[]): string | undefined => {
        if (!data || data.length === 0 || !data[0]) return undefined;
        const headers = Object.keys(data[0]);
        const header = headers.find(h => possibleNames.some(p => normalizeKey(h) === normalizeKey(p)));
        return header;
    };

    const h = {
        documento: findHeader(siengeData, ['documento', 'número', 'numero', 'numero da nota', 'nota fiscal']),
        credor: findHeader(siengeData, ['credor']),
    };
    
    if (!h.documento || !h.credor) {
        return [];
    }

    return siengeData.map(item => {
        const docNumberClean = cleanAndToStr(item[h.documento!]);
        const credorRaw = String(item[h.credor!] || '');
        const credorCodeMatch = credorRaw.match(/^(\d+)\s*-/);
        const credorCode = credorCodeMatch ? credorCodeMatch[1] : '';

        return { 
            "Chave de Depuração (Centro de Custo)": `${docNumberClean}-${credorCode}`,
            "Chave de Depuração (Contabilização)": `${docNumberClean}-${credorRaw}`,
            "Documento (Original)": item[h.documento!],
            "Credor (Original)": credorRaw,
        };
    });
}


export function processCostCenterData(costCenterSheetData: any[][]): {
    costCenterMap: Map<string, string>;
    debugKeys: any[];
    allCostCenters: string[];
    costCenterHeaderRows: any[][];
} {
    const costCenterMap = new Map<string, string>();
    const debugKeys: any[] = [];
    const allCostCenters: string[] = [];
    const costCenterHeaderRows: any[][] = [];

    if (!costCenterSheetData || costCenterSheetData.length === 0) {
        return { costCenterMap, debugKeys, allCostCenters, costCenterHeaderRows };
    }

    let currentCostCenter = 'N/A';

    costCenterSheetData.forEach((row, rowIndex) => {
        if (!row || !Array.isArray(row)) return;

        const colA = String(row[0] || '').trim();
        const colC = String(row[2] || '').trim(); 

        if (normalizeKey(colA) === normalizeKey('Centro de custo')) {
            currentCostCenter = colC;
            if (currentCostCenter && !allCostCenters.includes(currentCostCenter)) {
                allCostCenters.push(currentCostCenter);
            }
            costCenterHeaderRows.push(row);
            return; 
        }

        const colB_credor_raw = String(row[1] || '').trim();
        const colD_documento = String(row[3] || '').trim();
        const credorCodeMatch = colB_credor_raw.match(/^(\d+)\s*-/);
        const credorCode = credorCodeMatch ? credorCodeMatch[1] : '';
        
        if (credorCode && colD_documento) {
            const docNumber = cleanAndToStr(colD_documento);
            
            if (docNumber && credorCode) {
                 const key = `${docNumber}-${credorCode}`;
                 costCenterMap.set(key, currentCostCenter);

                debugKeys.push({
                    'Chave de Comparação (Doc-Credor)': key,
                    'Centro de Custo': currentCostCenter,
                    'Documento (Coluna D)': docNumber,
                    'Credor (Coluna B)': colB_credor_raw,
                    'Linha na Planilha': rowIndex + 1,
                });
            }
        }
    });

    return { costCenterMap, debugKeys, allCostCenters, costCenterHeaderRows };
}

export function processPayableAccountingData(accountingSheetData: any[][]): { 
    accountingMap: Map<string, { account: string; description: string }>;
    payableAccountingDebugKeys: any[];
} {
    const accountingMap = new Map<string, { account: string; description: string }>();
    const payableAccountingDebugKeys: any[] = [];

    if (!accountingSheetData || accountingSheetData.length === 0) {
        return { accountingMap, payableAccountingDebugKeys };
    }
    
    let headerRowIndex = -1;
    let credorIndex = -1;
    let docIndex = -1;

    for (let i = 0; i < accountingSheetData.length; i++) {
        const row = accountingSheetData[i];
        if (Array.isArray(row) && row.some(cell => typeof cell === 'string' && normalizeKey(cell) === 'credor')) {
            headerRowIndex = i;
            credorIndex = row.findIndex(cell => normalizeKey(cell) === 'credor');
            docIndex = row.findIndex(cell => normalizeKey(cell) === 'documento');
            break;
        }
    }

    if (headerRowIndex === -1 || credorIndex === -1 || docIndex === -1) {
        return { accountingMap, payableAccountingDebugKeys };
    }

    for (let i = headerRowIndex + 1; i < accountingSheetData.length; i++) {
        const currentRow = accountingSheetData[i];
        if (!Array.isArray(currentRow) || currentRow.length <= Math.max(credorIndex, docIndex)) {
            continue;
        }

        const credorName = String(currentRow[credorIndex] || '').trim();
        const docValue = String(currentRow[docIndex] || '').trim();
        
        if (!credorName || !docValue || normalizeKey(credorName) === 'credor') {
            continue;
        }
        
        let appropriationsRow = null;
        if(i + 1 < accountingSheetData.length) {
            const nextRow = accountingSheetData[i + 1];
            if (nextRow && Array.isArray(nextRow) && String(nextRow[0] || '').trim().toLowerCase().startsWith('apropriações:')) {
                appropriationsRow = nextRow;
            }
        }

        if (appropriationsRow) {
            const docNumberClean = cleanAndToStr(docValue);
            const accountingKey = `${docNumberClean}-${credorName}`;
            
            let accountInfo = '';
            for (let k = appropriationsRow.length - 1; k >= 0; k--) {
                const cellValue = String(appropriationsRow[k] || '').trim();
                if (cellValue.match(/^(\d{1,2}\.\d{2}\.\d{2}\.\d{2})/)) {
                    accountInfo = cellValue;
                    break;
                }
            }

            if (accountInfo) {
                const parts = accountInfo.split(' - ');
                const account = parts[0];
                const description = parts.slice(1).join(' - ');
                accountingMap.set(accountingKey, { account, description });

                payableAccountingDebugKeys.push({
                    'Chave de Depuração': accountingKey,
                    'Coluna Credor': credorName,
                    'Coluna Documento': docValue,
                    'Conta Encontrada': accountInfo,
                    'Linha': i + 1,
                });
            }
        }
    }
    
    return { accountingMap, payableAccountingDebugKeys };
}


export function processPaidAccountingData(paidSheetData: any[][]): { 
    accountingMap: Map<string, { account: string; description: string }>;
    paidAccountingDebugKeys: any[];
} {
    const accountingMap = new Map<string, { account: string; description: string }>();
    const paidAccountingDebugKeys: any[] = [];

    if (!paidSheetData || paidSheetData.length === 0) {
        return { accountingMap, paidAccountingDebugKeys };
    }

    for (let i = 0; i < paidSheetData.length; i++) {
        const currentRow = paidSheetData[i];
        if (!Array.isArray(currentRow) || currentRow.length < 3) continue;

        const firstCell = String(currentRow[0] || '').trim();
        const thirdCell = String(currentRow[2] || '').trim();

        const isHeaderOrFooter = ["empresa", "período", "credor", "data da baixa", "total do dia"].some(keyword => normalizeKey(firstCell).startsWith(keyword));
        if (isHeaderOrFooter || !firstCell || !thirdCell) {
            continue;
        }

        let appropriationsRow = null;
        if (i + 1 < paidSheetData.length) {
             const nextRow = paidSheetData[i + 1];
            if (nextRow && Array.isArray(nextRow) && String(nextRow[0] || '').trim().toLowerCase().startsWith('apropriações:')) {
                appropriationsRow = nextRow;
            }
        }

        if (appropriationsRow) {
            const docNumberClean = cleanAndToStr(thirdCell);
            const credorName = firstCell;
            const accountingKey = `${docNumberClean}-${credorName}`;
            
            let accountInfo = '';
            for (let k = appropriationsRow.length - 1; k >= 0; k--) {
                const cellValue = String(appropriationsRow[k] || '').trim();
                if (cellValue.match(/^(\d{1,2}\.\d{2}\.\d{2}\.\d{2})/)) {
                    accountInfo = cellValue;
                    break;
                }
            }

            if (accountInfo) {
                const parts = accountInfo.split(' - ');
                const account = parts[0];
                const description = parts.slice(1).join(' - ');
                accountingMap.set(accountingKey, { account, description });

                paidAccountingDebugKeys.push({
                    'Chave de Depuração': accountingKey,
                    'Coluna Credor': credorName,
                    'Coluna Documento': thirdCell,
                    'Conta Encontrada': accountInfo,
                    'Linha': i + 1,
                });
            }
        }
    }

    return { accountingMap, paidAccountingDebugKeys };
}
