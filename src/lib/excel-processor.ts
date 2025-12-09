
import { cfopDescriptions } from './cfop';
import * as XLSX from 'xlsx';
import type { KeyCheckResult } from '@/components/app/key-checker';
import type { AllClassifications } from '@/components/app/imobilizado-analysis';
import { normalizeKey, cleanAndToStr } from './utils';
import type { SpedDuplicate, SaidaItem } from './types';


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
        "tomadorCNPJ": cleanAndToStr(row['tomadorCNPJ']), // Simplificando para tomador
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

    if (!data || data.length === 0) return { costCenterMap, debugKeys, allCostCenters: [], costCenterHeaderRows: [] };
    
    let headerRowIndex = -1;
    let credorIndex = -1;
    let tituloIndex = -1;

    // 1. Encontrar a linha do cabeçalho e os índices das colunas de interesse
    for (let i = 0; i < Math.min(data.length, 20); i++) {
        const row = data[i];
        if (row && Array.isArray(row)) {
            const lowerCaseRow = row.map(cell => String(cell || '').toLowerCase());
            
            const credorIdx = lowerCaseRow.findIndex(cell => cell && (cell.includes('credor') || cell.includes('fornecedor')));
            const tituloIdx = lowerCaseRow.findIndex(cell => cell && (cell.includes('titulo') || cell.includes('título')));

            if (credorIdx !== -1 && tituloIdx !== -1) {
                headerRowIndex = i;
                credorIndex = credorIdx;
                tituloIndex = tituloIdx;
                break;
            }
        }
    }

    if (headerRowIndex === -1) {
        console.warn("Cabeçalho com 'Credor' e 'Título' não encontrado na planilha de Centro de Custo.");
        return { costCenterMap, debugKeys, allCostCenters: [], costCenterHeaderRows: [] };
    }

    // 2. Processar o ficheiro linha a linha
    let currentCostCenter = 'N/A';
    const cnpjRegex = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})|(\d{14})/; // Regex para encontrar CNPJ

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (!row || !Array.isArray(row) || row.every(cell => cell === null || cell === '')) continue;
        
        const rowAsString = row.join(';').toLowerCase();
        
        if (rowAsString.includes('centro de custo')) {
            const match = rowAsString.match(/centro de custo\s*;\s*;\s*([\d\s\w-]+)/);
            if (match && match[1]) {
                currentCostCenter = match[1].trim();
                costCenterSet.add(currentCostCenter);
                costCenterHeaderRows.push({
                    'Linha Original': row.join('; '),
                    'Centro de Custo Identificado': currentCostCenter
                });
            }
            continue;
        }
        
        if (i <= headerRowIndex) continue;

        const credorCell = row[credorIndex];
        const tituloCell = row[tituloIndex];
        
        if (credorCell && tituloCell) {
            const cnpjMatch = String(credorCell).match(cnpjRegex);
            const cnpj = cnpjMatch ? cleanAndToStr(cnpjMatch[0]) : null;
            const titulo = cleanAndToStr(tituloCell);
            
            if (titulo && cnpj) {
                const docKey = `${titulo}-${cnpj}`;
                if (!costCenterMap.has(docKey)) {
                    costCenterMap.set(docKey, currentCostCenter);
                }
                const debugInfo = {
                    'Chave Gerada (Centro de Custo)': docKey,
                    'Credor (Centro de Custo)': credorCell,
                    'Título Original': tituloCell,
                    'CNPJ Encontrado': cnpj,
                    'Centro de Custo': currentCostCenter,
                };
                debugKeys.push(debugInfo);
            }
        }
    }
    
    return { costCenterMap, debugKeys, allCostCenters: Array.from(costCenterSet), costCenterHeaderRows };
}

export function generateSiengeDebugKeys(siengeData: any[]): any[] {
    if (!siengeData || siengeData.length === 0) return [];
    
    const findHeader = (data: any[], possibleNames: string[]): string | undefined => {
        const headers = Object.keys(data[0] || {});
        return headers.find(h => possibleNames.some(p => normalizeKey(h) === normalizeKey(p)));
    };

    const h = {
        cnpj: findHeader(siengeData, ['cpf/cnpj', 'cpf/cnpj do fornecedor']),
        titulo: findHeader(siengeData, ['título', 'titulo']),
        credor: findHeader(siengeData, ['credor', 'fornecedor', 'nome do fornecedor']),
    };

    if (!h.cnpj || !h.titulo) {
        console.warn("Colunas 'CPF/CNPJ' ou 'Título' não encontradas na planilha Sienge para depuração.");
        return [];
    }

    return siengeData.map(item => {
        const cnpj = item[h.cnpj!];
        const titulo = item[h.titulo!];
        
        const docKey = `${cleanAndToStr(titulo)}-${cleanAndToStr(cnpj)}`;
        
        return {
            'Chave Gerada (Sienge)': docKey,
            'Título Original': titulo,
            'Credor Original': item[h.credor!] || 'N/A',
            'CNPJ Original': cnpj,
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
    
    const emptyResult = { reconciled: [], onlyInSienge: [], onlyInXml: [], devolucoesEP: [], debug: { costCenterKeys: [], siengeKeys: [] } };
    
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
                refNFe: header?.refNFe
            };
        });

        const filteredSiengeData = siengeData.filter(row => {
            const espValue = row[espHeader] ? String(row[espHeader]).trim().toUpperCase() : '';
            return espValue === 'NFE' || espValue === 'NFSR' || espValue === 'CTE';
        });

        const h = {
            cnpj: findHeader(filteredSiengeData, ['cpf/cnpj', 'cpf/cnpj do fornecedor']),
            numero: findHeader(filteredSiengeData, ['número', 'numero', 'numero da nota', 'nota fiscal']),
            titulo: findHeader(filteredSiengeData, ['título', 'titulo']),
            valorTotal: findHeader(filteredSiengeData, ['valor total', 'valor', 'vlr total']),
            credor: findHeader(filteredSiengeData, ['credor', 'fornecedor', 'nome do fornecedor']),
            cfop: findHeader(siengeData, ['cfop']),
            esp: findHeader(siengeData, ['esp']),
        };
        
        if (!h.cnpj || !h.numero || !h.valorTotal || !h.credor || !h.titulo) {
            throw new Error("Não foi possível encontrar as colunas essenciais ('Número', 'Título', 'CPF/CNPJ', 'Credor', 'Valor Total') na planilha Sienge.");
        }

        const getComparisonKey = (numero: any, cnpj: any, valor: any): string | null => {
            const cleanNumero = cleanAndToStr(numero);
            const cleanCnpj = cleanAndToStr(cnpj); // Standardize cleaning
            const cleanValor = parseFloat(String(valor || '0').replace(',', '.')).toFixed(2);
            if (!cleanNumero || !cleanCnpj || cleanValor === 'NaN') return null;
            return `${cleanNumero}-${cleanCnpj}-${cleanValor}`;
        };

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
                         if (costCenterMap && h.titulo && h.cnpj) {
                            const siengeTitulo = siengeItem[h.titulo!];
                            const siengeCnpj = siengeItem[h.cnpj!];

                            if (siengeTitulo && siengeCnpj) {
                                const docKey = `${cleanAndToStr(siengeTitulo)}-${cleanAndToStr(siengeCnpj)}`;
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
        
        let remainingSiengeItems = [...filteredSiengeData];
        let remainingXmlItems = [...enrichedXmlItems];

        const result = reconciliationPass(
            remainingSiengeItems,
            remainingXmlItems, 
            (item) => getComparisonKey(item[h.numero!], item[h.cnpj!], item[h.valorTotal!]),
            (item) => getComparisonKey(item['Número da Nota'], item['CPF/CNPJ do Emitente'], item['Valor Total']),
            "Valor Total"
        );
        let reconciled = result.matched;
        
        const devolucoesEP = (enrichedXmlItems || [])
            .filter(item => {
                const cfop = cleanAndToStr(item.CFOP);
                const natOp = (item['Natureza da Operação'] || '').toUpperCase();
                return (cfop.startsWith('5') || cfop.startsWith('6')) && natOp.includes('DEVOLUCAO');
            })
            .map(item => {
                const originalKeyClean = cleanAndToStr(item['refNFe'] || '');
                const foundInSienge = siengeData.some(siengeRow => {
                    const siengeDocNumber = cleanAndToStr(siengeRow[h.numero!]);
                    const siengeCnpjClean = cleanAndToStr(siengeRow[h.cnpj!]);
                    return originalKeyClean === `${siengeDocNumber}${siengeCnpjClean}`;
                });
                return {
                    'Número da Nota de Devolução': item['Número da Nota'],
                    'Fornecedor': item.Fornecedor,
                    'Valor': item['Valor Total'],
                    'Data Emissão': item.Emissão,
                    'Chave da Nota Original': originalKeyClean || 'Não encontrada no XML',
                    'Encontrada no Sienge': foundInSienge ? 'Sim' : 'Não'
                };
            });

        return { reconciled, onlyInSienge: result.remainingSienge, onlyInXml: result.remainingXml, devolucoesEP, debug: emptyResult.debug };
    } catch (err: any) {
        console.error("Reconciliation Error:", err);
        return { ...emptyResult, onlyInSienge: siengeData || [], onlyInXml: xmlItems };
    }
}

    