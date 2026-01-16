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
    log: LogFunction,
    costCenterMap?: Map<string, string> | null,
    accountingMap?: Map<string, { account: string; description: string }> | null
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
    
    // Executa uma conciliação interna para poder enriquecer os itens de imobilizado
    let reconciledMap = new Map();
    try {
        const internalReconciliation = runReconciliation(
            processedDfs["Itens do Sienge"] || [],
            itensValidos,
            notasValidas,
            cte,
            costCenterMap,
            accountingMap,
            devolucoesDeCompra,
            devolucoesDeClientes
        );

        // Mapeia os resultados da conciliação para busca rápida por Chave Única e Item
        internalReconciliation.reconciled.forEach(item => {
            const key = `${item['Chave Unica']}-${item['Item']}`;
            reconciledMap.set(key, item);
        });
    } catch (e) {
        log("Aviso: Não foi possível realizar a conciliação interna para imobilizados. Usando busca direta.");
    }

    log("Identificando itens para análise de imobilizado a partir dos itens válidos...");
    const nfeHeaderMap = new Map(notasValidas.map(n => [n['Chave Unica'], n]));

    const imobilizados = itensValidos
        .filter(item => {
            if (!item || !item['Valor Unitário']) return false;
            return parseFloat(String(item['Valor Unitário'])) > 1200;
        }).map((item) => {
            const header = nfeHeaderMap.get(item['Chave Unica']);
            const emitenteCnpj = header?.['CPF/CNPJ do Fornecedor'] || item['CPF/CNPJ do Emitente'] || '';
            const docNumber = item['Número da Nota'] || item['Número'] || header?.['Número'] || '';
            const credorName = item['Fornecedor'] || item['Emitente'] || header?.Fornecedor || 'N/A';
            const docNumberClean = cleanAndToStr(docNumber).replace(/^0+/, '');
            const credorCnpjClean = cleanAndToStr(emitenteCnpj);
            const normalizedCredor = normalizeKey(credorName);
            const credorCodeMatch = credorName.match(/^(\d+)\s*-/);
            const credorCode = credorCodeMatch ? credorCodeMatch[1] : '';

            // Tenta primeiro pegar os dados já conciliados (que têm o CFOP Sienge e outros dados)
            const reconciledItem = reconciledMap.get(`${item['Chave Unica']}-${item['Item']}`);
            
            let centroCusto = reconciledItem?.['Centro de Custo'] || 'N/A';
            let contabilizacao = reconciledItem?.['Contabilização'] || 'N/A';
            let cfopSienge = reconciledItem?.['CFOP (Sienge)'] || 'N/A';

            // Se não encontrou via conciliação ou está N/A, tenta a busca direta nos mapas
            if (centroCusto === 'N/A' && costCenterMap) {
                // 1. Busca por Documento + Credor (várias combinações)
                centroCusto = (
                    (credorCode ? costCenterMap.get(`${docNumberClean}-${credorCode}`) : null) ||
                    costCenterMap.get(`${docNumberClean}-${credorName}`) || 
                    costCenterMap.get(`${docNumberClean}-${normalizedCredor}`) ||
                    (credorCnpjClean ? costCenterMap.get(`${docNumberClean}-${credorCnpjClean}`) : null)
                ) || 'N/A';

                // 2. Busca sem a parcela do documento (se houver /)
                if (centroCusto === 'N/A' && String(docNumberClean).includes('/')) {
                    const docBase = docNumberClean.split('/')[0].replace(/^0+/, '');
                    centroCusto = (
                        (credorCode ? costCenterMap.get(`${docBase}-${credorCode}`) : null) ||
                        costCenterMap.get(`${docBase}-${credorName}`) || 
                        costCenterMap.get(`${docBase}-${normalizedCredor}`) ||
                        (credorCnpjClean ? costCenterMap.get(`${docBase}-${credorCnpjClean}`) : null)
                    ) || 'N/A';
                }

                // 3. FALLBACK: Tenta apenas pelo Credor (Código, Nome ou CNPJ) se o documento falhar
                if (centroCusto === 'N/A') {
                    const nameOnly = credorName.replace(/^\d+\s*-\s*/, '').trim();
                    centroCusto = (
                        (credorCode ? costCenterMap.get(credorCode) : null) ||
                        costCenterMap.get(normalizeKey(nameOnly)) ||
                        costCenterMap.get(normalizedCredor) ||
                        (credorCnpjClean ? costCenterMap.get(credorCnpjClean) : null)
                    ) || 'N/A';
                    
                    // Se ainda N/A, busca parcial nas chaves do mapa
                    if (centroCusto === 'N/A') {
                        for (const [key, value] of costCenterMap.entries()) {
                            const normalizedKeyStr = normalizeKey(key);
                            if (normalizedKeyStr.includes(normalizedCredor) || (credorCnpjClean && normalizedKeyStr.includes(credorCnpjClean))) {
                                centroCusto = value;
                                break;
                            }
                        }
                    }
                }
            }

            if (contabilizacao === 'N/A' && accountingMap) {
                // 1. Busca por Documento + Credor
                let accInfo = (
                    accountingMap.get(`${docNumberClean}-${credorName}`) ||
                    accountingMap.get(`${docNumberClean}-${normalizedCredor}`) ||
                    (credorCode ? accountingMap.get(`${docNumberClean}-${credorCode}`) : null) ||
                    (credorCnpjClean ? accountingMap.get(`${docNumberClean}-${credorCnpjClean}`) : null)
                );
                
                // 2. Busca sem parcela
                if (!accInfo && String(docNumberClean).includes('/')) {
                    const docBase = docNumberClean.split('/')[0].replace(/^0+/, '');
                    accInfo = (
                        accountingMap.get(`${docBase}-${credorName}`) ||
                        accountingMap.get(`${docBase}-${normalizedCredor}`) ||
                        (credorCode ? accountingMap.get(`${docBase}-${credorCode}`) : null) ||
                        (credorCnpjClean ? accountingMap.get(`${docBase}-${credorCnpjClean}`) : null)
                    );
                }

                // 3. FALLBACK: Apenas Credor
                if (!accInfo) {
                    const nameOnly = credorName.replace(/^\d+\s*-\s*/, '').trim();
                    accInfo = (
                        (credorCode ? accountingMap.get(credorCode) : null) ||
                        accountingMap.get(normalizeKey(nameOnly)) ||
                        accountingMap.get(normalizedCredor) ||
                        (credorCnpjClean ? accountingMap.get(credorCnpjClean) : null)
                    ) as any;

                    if (!accInfo) {
                        for (const [key, value] of accountingMap.entries()) {
                            const normalizedKeyStr = normalizeKey(key);
                            if (normalizedKeyStr.includes(normalizedCredor) || (credorCnpjClean && normalizedKeyStr.includes(credorCnpjClean))) {
                                accInfo = value as any;
                                break;
                            }
                        }
                    }
                }

                contabilizacao = accInfo ? (accInfo.formattedFull || `${accInfo.account} - ${accInfo.description}`) : 'N/A';
            }

            return {
                ...item,
                id: `${item['Chave Unica'] || ''}-${item['Item'] || ''}`,
                uniqueItemId: `${cleanAndToStr(emitenteCnpj)}-${cleanAndToStr(item['Código'] || '')}`,
                Fornecedor: credorName,
                'CPF/CNPJ do Fornecedor': emitenteCnpj,
                destUF: header?.destUF || '',
                'Alíq. ICMS (%)': item['Alíq. ICMS (%)'] === undefined ? null : item['Alíq. ICMS (%)'],
                'Centro de Custo': centroCusto,
                'Contabilização': contabilizacao,
                'CFOP (Sienge)': cfopSienge,
                'Descricao CFOP': item['Descricao CFOP'] || 'N/A'
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
            // Se for a aba de Imobilizados, garante que os campos enriquecidos estão lá
            if (name === "Imobilizados") {
                finalSheetSet[name] = sheetData.map(row => {
                    const rowWithCfop = addCfopDescriptionToRow(row);
                    return {
                        ...rowWithCfop,
                        'Centro de Custo': row['Centro de Custo'] || 'N/A',
                        'Contabilização': row['Contabilização'] || 'N/A'
                    };
                });
            } else {
                finalSheetSet[name] = sheetData.map(addCfopDescriptionToRow);
            }
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
    siengeSheetData: any[],
    xmlItems: any[],
    nfeEntradas: any[],
    cteData: any[],
    costCenterMap?: Map<string, string> | null,
    accountingMap?: Map<string, { account: string; description: string }> | null,
    devolucoesCompra: any[] = [],
    devolucoesClientes: any[] = [],
): ReconciliationResults {
    
    const findHeader = (data: any[], possibleNames: string[]): string | undefined => {
        if (!data || data.length === 0 || !data[0]) return undefined;
        const headers = Object.keys(data[0]);
        return headers.find(h => possibleNames.some(p => normalizeKey(h) === normalizeKey(p)));
    };
    
    const h = {
        esp: findHeader(siengeSheetData, ['esp', 'especie']),
        documento: findHeader(siengeSheetData, ['documento', 'número', 'numero', 'numerodanota', 'nota fiscal', 'nota']),
        credor: findHeader(siengeSheetData, ['credor', 'fornecedor']),
        cnpj: findHeader(siengeSheetData, ['cpf/cnpj', 'cpf/cnpj do fornecedor', 'cnpj', 'cpfcnpj']),
        valor: findHeader(siengeSheetData, ['valor', 'valortotal', 'vlr total', 'valor total', 'total']),
        cfop: findHeader(siengeSheetData, ['cfop']),
        produtoFiscal: findHeader(siengeSheetData, ['produto fiscal', 'descrição do item', 'descrição']),
        desconto: findHeader(siengeSheetData, ['desconto']),
        frete: findHeader(siengeSheetData, ['frete']),
        ipi: findHeader(siengeSheetData, ['ipi']),
    };

    if (!h.documento || !h.cnpj || !h.valor) {
        throw new Error("Não foi possível encontrar as colunas essenciais ('Documento', 'CPF/CNPJ', 'Valor') na planilha Sienge.");
    }
    
    const siengeToReconcile = h.esp 
        ? siengeSheetData.filter(row => ['NFE', 'NFSR', 'CTE'].includes(String(row[h.esp!]).trim().toUpperCase()))
        : siengeSheetData;
    
    const otherSiengeItemsRaw = h.esp
        ? siengeSheetData.filter(row => !['NFE', 'NFSR', 'CTE'].includes(String(row[h.esp!]).trim().toUpperCase()))
        : [];
    
    const getXmlDocKey = (item: any) => item['Número da Nota'] || item['Número'];
    const getXmlCnpjKey = (item: any) => item['CPF/CNPJ do Emitente'] || item['CPF/CNPJ do Fornecedor'];

    const reconciliationPass = (siengeItems: any[], xmlItems: any[], getSiengeKey: (item: any) => string | null, getXmlKey: (item: any) => string | null, passName: string) => {
        const matchedInPass: any[] = [];
        const stillUnmatchedSienge: any[] = [];
        const xmlMap = new Map<string, any[]>();
        const matchedXmlIndices = new Set<number>();
        
        // Indexa XMLs por chave
        xmlItems.forEach((item, index) => {
            const key = getXmlKey(item);
            if (key) {
                if (!xmlMap.has(key)) xmlMap.set(key, []);
                xmlMap.get(key)!.push({ item, index });
            }
        });

        siengeItems.forEach(siengeItem => {
            const key = getSiengeKey(siengeItem);
            if (key && xmlMap.has(key)) {
                const matchedXmlEntries = xmlMap.get(key)!;
                
                if (matchedXmlEntries.length > 0) {
                    let bestMatch: { item: any; index: number } | null = null;
                    
                    // Se há múltiplos matches, tenta encontrar o melhor baseado na proximidade de valores
                    if (matchedXmlEntries.length > 1 && h.valor) {
                        const siengeValue = normalizeValue(siengeItem[h.valor!]);
                        let minDiff = Infinity;
                        
                        matchedXmlEntries.forEach(({ item: xmlItem, index }) => {
                            if (matchedXmlIndices.has(index)) return; // Já foi usado
                            
                            const xmlValue = normalizeValue(xmlItem['Valor Total'] || xmlItem['Valor da Prestação'] || 0);
                            const diff = Math.abs(siengeValue - xmlValue);
                            
                            if (diff < minDiff) {
                                minDiff = diff;
                                bestMatch = { item: xmlItem, index };
                            }
                        });
                    }
                    
                    // Se não encontrou melhor match ou só há um, usa o primeiro disponível
                    if (!bestMatch) {
                        for (const { item: xmlItem, index } of matchedXmlEntries) {
                            if (!matchedXmlIndices.has(index)) {
                                bestMatch = { item: xmlItem, index };
                                break;
                            }
                        }
                    }
                    
                    if (bestMatch) {
                        matchedXmlIndices.add(bestMatch.index);
                        const combined = { 
                            ...bestMatch.item, 
                            ...Object.fromEntries(Object.entries(siengeItem).map(([k, v]) => [`Sienge_${k}`, v])), 
                            'Observações': `Conciliado via ${passName}`
                        };
                        matchedInPass.push(combined);
                        return;
                    }
                }
            }
            stillUnmatchedSienge.push(siengeItem);
        });

        // Remove XMLs que foram pareados
        const stillUnmatchedXml = xmlItems.filter((_, index) => !matchedXmlIndices.has(index));
        return { matched: matchedInPass, remainingSienge: stillUnmatchedSienge, remainingXml: stillUnmatchedXml };
    };

    let reconciled: any[] = [];
    let remainingXml = [...xmlItems, ...cteData];
    let remainingSienge = [...siengeToReconcile];

    const normalizeValue = (value: any): number => {
        if (value === null || value === undefined) return 0;
        const strValue = String(value).trim().replace(/\./g, '').replace(',', '.');
        const numValue = parseFloat(strValue);
        return isNaN(numValue) ? 0 : numValue;
    };

    const createComparisonKey = (docNum: any, cnpj: any, value: any): string | null => {
        const cleanDoc = cleanAndToStr(docNum);
        const cleanCnpj = cleanAndToStr(cnpj);
        if (!cleanDoc || !cleanCnpj) return null;
        if (value !== null && value !== undefined) {
            const cleanValue = normalizeValue(value).toFixed(2);
            if (cleanValue === 'NaN') return null;
            return `${cleanDoc}-${cleanCnpj}-${cleanValue}`;
        }
        return `${cleanDoc}-${cleanCnpj}`;
    };

    const createDocCnpjKey = (docNum: any, cnpj: any): string | null => {
        const cleanDoc = cleanAndToStr(docNum);
        const cleanCnpj = cleanAndToStr(cnpj);
        if (!cleanDoc || !cleanCnpj) return null;
        return `${cleanDoc}-${cleanCnpj}`;
    };

    // Passes de conciliação - do mais específico para o mais genérico
    const passes = [
        // Pass 1: Valor Total exato
        { name: 'Valor Total', siengeKey: (item: any) => createComparisonKey(item[h.documento!], item[h.cnpj!], item[h.valor!]), xmlKey: (item: any) => createComparisonKey(getXmlDocKey(item), getXmlCnpjKey(item), item['Valor Total'] || item['Valor da Prestação']) },
        
        // Pass 2: Preço Unitário
        { name: 'Preço Unitário', siengeKey: (item: any) => createComparisonKey(item[h.documento!], item[h.cnpj!], item.precoUnitario), xmlKey: (item: any) => createComparisonKey(getXmlDocKey(item), getXmlCnpjKey(item), item['Valor Unitário']) },
        
        // Pass 3: ICMS Outras
        { name: 'ICMS Outras', siengeKey: (item: any) => createComparisonKey(item[h.documento!], item[h.cnpj!], item.icmsOutras), xmlKey: (item: any) => createComparisonKey(getXmlDocKey(item), getXmlCnpjKey(item), item['Valor Total'] || item['Valor da Prestação']) },
        
        // Pass 4: Valor Total + Desconto
        { name: 'Valor Total + Desconto', siengeKey: (item: any) => {
            const valorBase = normalizeValue(item[h.valor!]);
            const desconto = h.desconto ? normalizeValue(item[h.desconto]) : normalizeValue(item.desconto);
            return createComparisonKey(item[h.documento!], item[h.cnpj!], valorBase + desconto);
        }, xmlKey: (item: any) => createComparisonKey(getXmlDocKey(item), getXmlCnpjKey(item), item['Valor Total'] || item['Valor da Prestação'])},
        
        // Pass 5: Valor Total - Frete
        { name: 'Valor Total - Frete', siengeKey: (item: any) => {
            const valorBase = normalizeValue(item[h.valor!]);
            const frete = h.frete ? normalizeValue(item[h.frete]) : normalizeValue(item.frete);
            return createComparisonKey(item[h.documento!], item[h.cnpj!], valorBase - frete);
        }, xmlKey: (item: any) => createComparisonKey(getXmlDocKey(item), getXmlCnpjKey(item), item['Valor Total'] || item['Valor da Prestação'])},
        
        // Pass 6: Valor Total + IPI
        { name: 'Valor Total + IPI', siengeKey: (item: any) => {
            const valorBase = normalizeValue(item[h.valor!]);
            const ipi = h.ipi ? normalizeValue(item[h.ipi]) : normalizeValue(item.ipi);
            return createComparisonKey(item[h.documento!], item[h.cnpj!], valorBase + ipi);
        }, xmlKey: (item: any) => createComparisonKey(getXmlDocKey(item), getXmlCnpjKey(item), item['Valor Total'] || item['Valor da Prestação'])},
        
        // Pass 5: Valor Total - Desconto (caso desconto esteja sendo somado incorretamente)
        { name: 'Valor Total - Desconto', siengeKey: (item: any) => {
            const valorBase = normalizeValue(item[h.valor!]);
            const desconto = h.desconto ? normalizeValue(item[h.desconto]) : normalizeValue(item.desconto);
            return createComparisonKey(item[h.documento!], item[h.cnpj!], valorBase - desconto);
        }, xmlKey: (item: any) => createComparisonKey(getXmlDocKey(item), getXmlCnpjKey(item), item['Valor Total'] || item['Valor da Prestação'])},
        
        // Pass 6: Valor Total - Frete
        { name: 'Valor Total - Frete', siengeKey: (item: any) => {
            const valorBase = normalizeValue(item[h.valor!]);
            const frete = h.frete ? normalizeValue(item[h.frete]) : normalizeValue(item.frete);
            return createComparisonKey(item[h.documento!], item[h.cnpj!], valorBase - frete);
        }, xmlKey: (item: any) => createComparisonKey(getXmlDocKey(item), getXmlCnpjKey(item), item['Valor Total'] || item['Valor da Prestação'])},
        
        // Pass 7: Valor Total + Frete
        { name: 'Valor Total + Frete', siengeKey: (item: any) => {
            const valorBase = normalizeValue(item[h.valor!]);
            const frete = h.frete ? normalizeValue(item[h.frete]) : normalizeValue(item.frete);
            return createComparisonKey(item[h.documento!], item[h.cnpj!], valorBase + frete);
        }, xmlKey: (item: any) => createComparisonKey(getXmlDocKey(item), getXmlCnpjKey(item), item['Valor Total'] || item['Valor da Prestação'])},
        
        // Pass 8: Valor Total + IPI
        { name: 'Valor Total + IPI', siengeKey: (item: any) => {
            const valorBase = normalizeValue(item[h.valor!]);
            const ipi = h.ipi ? normalizeValue(item[h.ipi]) : normalizeValue(item.ipi);
            return createComparisonKey(item[h.documento!], item[h.cnpj!], valorBase + ipi);
        }, xmlKey: (item: any) => createComparisonKey(getXmlDocKey(item), getXmlCnpjKey(item), item['Valor Total'] || item['Valor da Prestação'])},
        
        // Pass 9: Valor Total - IPI
        { name: 'Valor Total - IPI', siengeKey: (item: any) => {
            const valorBase = normalizeValue(item[h.valor!]);
            const ipi = h.ipi ? normalizeValue(item[h.ipi]) : normalizeValue(item.ipi);
            return createComparisonKey(item[h.documento!], item[h.cnpj!], valorBase - ipi);
        }, xmlKey: (item: any) => createComparisonKey(getXmlDocKey(item), getXmlCnpjKey(item), item['Valor Total'] || item['Valor da Prestação'])},
        
        // Pass 10: Valor Total + Frete + Desconto
        { name: 'Valor Total + Frete + Desconto', siengeKey: (item: any) => {
            const valorBase = normalizeValue(item[h.valor!]);
            const frete = h.frete ? normalizeValue(item[h.frete]) : normalizeValue(item.frete);
            const desconto = h.desconto ? normalizeValue(item[h.desconto]) : normalizeValue(item.desconto);
            return createComparisonKey(item[h.documento!], item[h.cnpj!], valorBase + frete + desconto);
        }, xmlKey: (item: any) => createComparisonKey(getXmlDocKey(item), getXmlCnpjKey(item), item['Valor Total'] || item['Valor da Prestação'])},
        
        // Pass 11: Valor Total - Frete - Desconto
        { name: 'Valor Total - Frete - Desconto', siengeKey: (item: any) => {
            const valorBase = normalizeValue(item[h.valor!]);
            const frete = h.frete ? normalizeValue(item[h.frete]) : normalizeValue(item.frete);
            const desconto = h.desconto ? normalizeValue(item[h.desconto]) : normalizeValue(item.desconto);
            return createComparisonKey(item[h.documento!], item[h.cnpj!], valorBase - frete - desconto);
        }, xmlKey: (item: any) => createComparisonKey(getXmlDocKey(item), getXmlCnpjKey(item), item['Valor Total'] || item['Valor da Prestação'])},
        
        // Pass 12: Valor Total + IPI + Frete
        { name: 'Valor Total + IPI + Frete', siengeKey: (item: any) => {
            const valorBase = normalizeValue(item[h.valor!]);
            const ipi = h.ipi ? normalizeValue(item[h.ipi]) : normalizeValue(item.ipi);
            const frete = h.frete ? normalizeValue(item[h.frete]) : normalizeValue(item.frete);
            return createComparisonKey(item[h.documento!], item[h.cnpj!], valorBase + ipi + frete);
        }, xmlKey: (item: any) => createComparisonKey(getXmlDocKey(item), getXmlCnpjKey(item), item['Valor Total'] || item['Valor da Prestação'])},
        
        // Pass 13: Valor Total - IPI - Frete
        { name: 'Valor Total - IPI - Frete', siengeKey: (item: any) => {
            const valorBase = normalizeValue(item[h.valor!]);
            const ipi = h.ipi ? normalizeValue(item[h.ipi]) : normalizeValue(item.ipi);
            const frete = h.frete ? normalizeValue(item[h.frete]) : normalizeValue(item.frete);
            return createComparisonKey(item[h.documento!], item[h.cnpj!], valorBase - ipi - frete);
        }, xmlKey: (item: any) => createComparisonKey(getXmlDocKey(item), getXmlCnpjKey(item), item['Valor Total'] || item['Valor da Prestação'])},
        
        // Pass 14: Documento + Valor Total (sem CNPJ)
        { name: 'Documento + Valor Total', siengeKey: (item: any) => {
            const cleanDoc = cleanAndToStr(item[h.documento!]);
            const cleanValue = normalizeValue(item[h.valor!]).toFixed(2);
            return cleanDoc && cleanValue !== 'NaN' ? `${cleanDoc}-${cleanValue}` : null;
        }, xmlKey: (item: any) => {
            const cleanDoc = cleanAndToStr(getXmlDocKey(item));
            const cleanValue = normalizeValue(item['Valor Total'] || item['Valor da Prestação'] || 0).toFixed(2);
            return cleanDoc && cleanValue !== 'NaN' ? `${cleanDoc}-${cleanValue}` : null;
        }},
        
        // Pass 15: CNPJ + Valor Total (sem Documento)
        { name: 'CNPJ + Valor Total', siengeKey: (item: any) => {
            const cleanCnpj = cleanAndToStr(item[h.cnpj!]);
            const cleanValue = normalizeValue(item[h.valor!]).toFixed(2);
            return cleanCnpj && cleanValue !== 'NaN' ? `${cleanCnpj}-${cleanValue}` : null;
        }, xmlKey: (item: any) => {
            const cleanCnpj = cleanAndToStr(getXmlCnpjKey(item));
            const cleanValue = normalizeValue(item['Valor Total'] || item['Valor da Prestação'] || 0).toFixed(2);
            return cleanCnpj && cleanValue !== 'NaN' ? `${cleanCnpj}-${cleanValue}` : null;
        }},
        
        // Pass 16: Apenas Documento + CNPJ (sem valor) - mais flexível
        { name: 'Documento + CNPJ', siengeKey: (item: any) => createDocCnpjKey(item[h.documento!], item[h.cnpj!]), xmlKey: (item: any) => createDocCnpjKey(getXmlDocKey(item), getXmlCnpjKey(item)) },
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
        
        const siengeDocNumberRaw = item[`Sienge_${h.documento!}`] || item['Número da Nota'] || item['Número'] || '';
        const siengeCredorRaw = item[`Sienge_${h.credor!}`] || item['Fornecedor'] || item['Emitente'] || '';
        const emitenteCnpj = item['CPF/CNPJ do Emitente'] || item['emitCNPJ'] || '';

        const docNumberClean = cleanAndToStr(siengeDocNumberRaw || item['Número da Nota'] || item['Número']).replace(/^0+/, '');
        const credorRaw = String(siengeCredorRaw).trim();
        const credorCnpjClean = cleanAndToStr(emitenteCnpj);
        const credorCodeMatch = credorRaw.match(/^(\d+)\s*-/);
        const credorCode = credorCodeMatch ? credorCodeMatch[1] : '';
        const normalizedCredor = normalizeKey(credorRaw);
        const nameOnly = credorRaw.replace(/^\d+\s*-\s*/, '').trim();

        if (costCenterMap) {
            // Tenta várias combinações para encontrar o match
            let cc = (
                (docNumberClean && credorCode ? costCenterMap.get(`${docNumberClean}-${credorCode}`) : null) ||
                (docNumberClean ? costCenterMap.get(`${docNumberClean}-${credorRaw}`) : null) ||
                (docNumberClean ? costCenterMap.get(`${docNumberClean}-${normalizedCredor}`) : null) ||
                (docNumberClean && credorCnpjClean ? costCenterMap.get(`${docNumberClean}-${credorCnpjClean}`) : null)
            );
            
            // Tenta com nome sem código
            if (!cc && docNumberClean) {
                cc = costCenterMap.get(`${docNumberClean}-${normalizeKey(nameOnly)}`) ||
                     costCenterMap.get(`${docNumberClean}-${nameOnly}`);
            }
            
            // Se ainda não achou e o documento tem barra, tenta sem a parcela
            if ((!cc || cc === 'N/A') && docNumberClean.includes('/')) {
                const docBase = docNumberClean.split('/')[0].replace(/^0+/, '');
                cc = (
                    (credorCode ? costCenterMap.get(`${docBase}-${credorCode}`) : null) ||
                    costCenterMap.get(`${docBase}-${credorRaw}`) ||
                    costCenterMap.get(`${docBase}-${normalizedCredor}`)
                );
            }

            // NOVO FALLBACK: Tenta apenas pelo Credor (Código, Nome ou CNPJ) se o documento falhar
            if (!cc || cc === 'N/A') {
                cc = (
                    (credorCode ? costCenterMap.get(credorCode) : null) ||
                    costCenterMap.get(normalizeKey(nameOnly)) ||
                    costCenterMap.get(normalizedCredor) ||
                    (credorCnpjClean ? costCenterMap.get(credorCnpjClean) : null)
                );
                
                if (!cc || cc === 'N/A') {
                    for (const [key, value] of costCenterMap.entries()) {
                        const normalizedKeyStr = normalizeKey(key);
                        if (normalizedKeyStr.includes(normalizedCredor) || (credorCnpjClean && normalizedKeyStr.includes(credorCnpjClean))) {
                            cc = value;
                            break;
                        }
                    }
                }
            }

            item['Centro de Custo'] = cc || 'N/A';
        } else {
            item['Centro de Custo'] = 'N/A';
        }
        
        if (accountingMap) {
            // Tenta várias combinações para encontrar o match
            let accInfo = (
                (docNumberClean ? accountingMap.get(`${docNumberClean}-${credorRaw}`) : null) ||
                (docNumberClean ? accountingMap.get(`${docNumberClean}-${normalizedCredor}`) : null) ||
                (docNumberClean && credorCode ? accountingMap.get(`${docNumberClean}-${credorCode}`) : null) ||
                (docNumberClean && credorCnpjClean ? accountingMap.get(`${docNumberClean}-${credorCnpjClean}`) : null)
            );

            // Tenta com nome sem código
            if (!accInfo && docNumberClean) {
                accInfo = accountingMap.get(`${docNumberClean}-${normalizeKey(nameOnly)}`) ||
                          accountingMap.get(`${docNumberClean}-${nameOnly}`);
            }

            // Se ainda não achou e o documento tem barra (ex: 1234/1), tenta buscar sem a parcela
            if (!accInfo && docNumberClean.includes('/')) {
                const docBase = docNumberClean.split('/')[0].replace(/^0+/, '');
                accInfo = accountingMap.get(`${docBase}-${credorRaw}`) ||
                          accountingMap.get(`${docBase}-${normalizedCredor}`) ||
                          (credorCode ? accountingMap.get(`${docBase}-${credorCode}`) : null);
            }

            // NOVO FALLBACK: Tenta apenas pelo Credor se o documento falhar
            if (!accInfo) {
                accInfo = (
                    (credorCode ? accountingMap.get(credorCode) : null) ||
                    accountingMap.get(normalizeKey(nameOnly)) ||
                    accountingMap.get(normalizedCredor) ||
                    (credorCnpjClean ? accountingMap.get(credorCnpjClean) : null)
                ) as any;

                if (!accInfo) {
                    for (const [key, value] of accountingMap.entries()) {
                        const normalizedKeyStr = normalizeKey(key);
                        if (normalizedKeyStr.includes(normalizedCredor) || (credorCnpjClean && normalizedKeyStr.includes(credorCnpjClean))) {
                            accInfo = value as any;
                            break;
                        }
                    }
                }
            }
            
            item['Contabilização'] = accInfo ? (accInfo.formattedFull || `${accInfo.account} - ${accInfo.description}`) : 'N/A';
        } else {
            item['Contabilização'] = 'N/A';
        }
        
        const siengeCfopRaw = (h.cfop && (item[`Sienge_${h.cfop}`] || item[h.cfop])) || item['Sienge_CFOP'] || item['CFOP'];
        const siengeEspRaw = (h.esp && (item[`Sienge_${h.esp}`] || item[h.esp])) || item['Sienge_Esp'] || item['Esp'] || item['Espécie'];
        
        item['CFOP (Sienge)'] = siengeCfopRaw ? String(siengeCfopRaw).trim() : 'N/A';
        item['Sienge_Esp'] = siengeEspRaw ? String(siengeEspRaw).trim() : 'N/A';
        return item;
    };
    
    // Devoluções EP: Notas de Emissão Própria ou notas de entrada com natureza de devolução
    const allPossibleDevolucoes = [
        ...(devolucoesCompra || []), 
        ...(devolucoesClientes || []),
        ...(nfeEntradas || [])
    ];
    
    const devolucoesEP = allPossibleDevolucoes.filter(item => {
        if (!item) return false;
        
        // 1. Verificar por Finalidade (finNFe = 4 é Devolução)
        if (String(item.finNFe) === '4') return true;
        
        // 2. Verificar por Natureza da Operação (com flexibilidade de nomes)
        const natOpKey = Object.keys(item).find(k => 
            normalizeKey(k).includes('natureza') && (normalizeKey(k).includes('operacao') || normalizeKey(k).includes('op'))
        );
        
        const natOp = String(item[natOpKey || 'Natureza da Operação'] || '').toUpperCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remove acentos
            
        return natOp.includes('DEVOLUCAO');
    }).map(item => ({
        'Número da Nota de Devolução': item['Número'] || item['Número da Nota'],
        'Fornecedor': item.Fornecedor || item.Emitente || item.Destinatário,
        'Valor': item['Total'] || item['Valor Total'],
        'Data Emissão': item.Emissão || item['Data Emissão'],
        'Natureza': item['Natureza da Operação'] || 'Devolução',
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
        documento: findHeader(siengeData, ['documento', 'número', 'numero', 'numerodanota', 'nota fiscal']),
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
        const nameOnly = colB_credor_raw.replace(/^\d+\s*-\s*/, '').trim();

        // 1. Indexar apenas pelo credor (sempre, mesmo sem documento)
        if (colB_credor_raw) {
            costCenterMap.set(normalizeKey(nameOnly), currentCostCenter);
            costCenterMap.set(normalizeKey(colB_credor_raw), currentCostCenter);
            if (credorCode) costCenterMap.set(credorCode, currentCostCenter);
        }
        
        if (colD_documento) {
            const docNumber = cleanAndToStr(colD_documento).replace(/^0+/, '');
            
            // 2. Indexar pelo Código do Credor + Doc
            if (credorCode) {
                 const key = `${docNumber}-${credorCode}`;
                 costCenterMap.set(key, currentCostCenter);
            }

            // 3. Indexar pelo Nome Completo + Doc
            costCenterMap.set(`${docNumber}-${colB_credor_raw}`, currentCostCenter);
            
            // 4. Indexar pelo Nome Normalizado + Doc
            costCenterMap.set(`${docNumber}-${normalizeKey(nameOnly)}`, currentCostCenter);
            costCenterMap.set(`${docNumber}-${normalizeKey(colB_credor_raw)}`, currentCostCenter);

            // 5. Indexar pelo Nome sem o Código + Doc
            if (nameOnly !== colB_credor_raw) {
                costCenterMap.set(`${docNumber}-${nameOnly}`, currentCostCenter);
            }

            debugKeys.push({
                'Chave de Comparação (Doc-Credor)': `${docNumber}-${credorCode || colB_credor_raw}`,
                'Centro de Custo': currentCostCenter,
                'Documento (Coluna D)': docNumber,
                'Credor (Coluna B)': colB_credor_raw,
                'Linha na Planilha': rowIndex + 1,
            });
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
    let codeIndex = -1;
    let docIndex = -1;

    for (let i = 0; i < accountingSheetData.length; i++) {
        const row = accountingSheetData[i];
        if (Array.isArray(row)) {
            const rowKeys = Array.from(row).map(cell => normalizeKey(cell));
            const hasCredor = rowKeys.some(k => k === 'credor' || k === 'fornecedor' || k === 'forn' || k === 'parceiro' || k.includes('nome do credor'));
            const hasDoc = rowKeys.some(k => k && (
                k === 'documento' || k.includes('documento') || k.includes('numerodanota') || 
                k === 'nota' || k === 'nf' || k === 'numnota' || k === 'nrdoc' || k === 'título'
            ));
            
            if (hasCredor && hasDoc) {
                headerRowIndex = i;
                credorIndex = rowKeys.findIndex(k => k === 'credor' || k === 'fornecedor' || k === 'forn' || k === 'parceiro' || k.includes('nome do credor'));
                codeIndex = rowKeys.findIndex(k => k && (k.includes('cdcred') || k.includes('codcredor') || k.includes('codigo')));
                docIndex = rowKeys.findIndex(k => k && (
                    k === 'documento' || k.includes('documento') || k.includes('numerodanota') || 
                    k === 'nota' || k === 'nf' || k === 'numnota' || k === 'nrdoc' || k === 'título'
                ));
                break;
            }
        }
    }

    // Fallback se não encontrar cabeçalhos
    const useIndices = headerRowIndex === -1;
    const startIdx = useIndices ? 0 : headerRowIndex + 1;
    const finalCredorIdx = (useIndices || credorIndex === -1) ? 0 : credorIndex;
    const finalCodeIdx = (useIndices || codeIndex === -1) ? 1 : codeIndex;
    const finalDocIdx = (useIndices || docIndex === -1) ? 2 : docIndex;

    for (let i = startIdx; i < accountingSheetData.length; i++) {
        const currentRow = accountingSheetData[i];
        if (!Array.isArray(currentRow)) continue;
        
        // Garante que o array tenha o tamanho necessário antes de acessar
        const maxIdx = Math.max(finalCredorIdx, finalDocIdx, finalCodeIdx);
        if (currentRow.length <= maxIdx) continue;

        const credorName = String(currentRow[finalCredorIdx] || '').trim();
        const credorCode = finalCodeIdx !== -1 ? String(currentRow[finalCodeIdx] || '').trim() : '';
        const docValue = String(currentRow[finalDocIdx] || '').trim();
        
        const isHeader = ["empresa", "período", "credor", "documento"].some(keyword => normalizeKey(credorName).startsWith(keyword));
        if (!credorName || isHeader) {
            continue;
        }
        
        const appropriations: { account: string; description: string }[] = [];
        let nextRowIdx = i + 1;
        
        while (nextRowIdx < accountingSheetData.length) {
            const nextRow = accountingSheetData[nextRowIdx];
            if (!nextRow || !Array.isArray(nextRow)) break;
            
            // Procura "Apropriações:" em qualquer lugar da linha
            const hasAppropriationLabel = nextRow.some(cell => 
                String(cell || '').trim().toLowerCase().includes('apropriações:')
            );
            
            // Se a primeira célula for vazia mas a linha tiver conteúdo, pode ser continuação de apropriação
            const isEmptyFirstCell = String(nextRow[0] || '').trim() === '' && nextRow.some(cell => String(cell || '').trim() !== '');
            
            if (hasAppropriationLabel || isEmptyFirstCell) {
                let accountInfo = '';
                for (let k = 0; k < nextRow.length; k++) {
                    const cellValue = String(nextRow[k] || '').trim();
                    // Regex para conta contábil (ex: 2.01.06.09)
                    if (cellValue.match(/^(\d{1,2}\.\d{2}\.\d{2}\.\d{2})/)) {
                        accountInfo = cellValue;
                        break;
                    }
                }

                if (accountInfo) {
                    const parts = accountInfo.split(' - ');
                    const account = parts[0];
                    const description = parts.slice(1).join(' - ');
                    if (!appropriations.some(a => a.account === account)) {
                        appropriations.push({ account, description });
                    }
                }
                nextRowIdx++;
            } else {
                break;
            }
        }

        if (appropriations.length > 0) {
            const docNumberClean = cleanAndToStr(docValue).replace(/^0+/, '');
            
            // Formata cada conta com sua respectiva descrição individualmente
            const consolidatedAccount = appropriations.map(a => a.account).join(' / ');
            const consolidatedDesc = appropriations.map(a => a.description).join(' / ');
            const formattedFull = appropriations.map(a => `${a.account} - ${a.description}`).join(' / ');
            
            const accInfo = { 
                account: consolidatedAccount, 
                description: consolidatedDesc,
                formattedFull: formattedFull // Nova propriedade com o formato desejado
            };

            // 1. Chave com Nome Original e Normalizado
            accountingMap.set(`${docNumberClean}-${credorName.trim()}`, accInfo);
            
            // Nome sem código para normalização
            const nameOnly = credorName.replace(/^\d+\s*-\s*/, '').trim();
            accountingMap.set(`${docNumberClean}-${normalizeKey(nameOnly)}`, accInfo);
            accountingMap.set(`${docNumberClean}-${normalizeKey(credorName)}`, accInfo);

            // 2. Indexar apenas pelo credor (para fallbacks sem documento)
            accountingMap.set(normalizeKey(nameOnly), accInfo as any);
            accountingMap.set(normalizeKey(credorName), accInfo as any);
            if (credorCode) accountingMap.set(credorCode, accInfo as any);
            
            // 2. Tentar extrair partes do nome (separadas por " - ")
            const parts = credorName.split(/\s*-\s*/);
            parts.forEach(part => {
                const trimmed = part.trim();
                if (trimmed) {
                    accountingMap.set(`${docNumberClean}-${trimmed}`, accInfo);
                    accountingMap.set(`${docNumberClean}-${normalizeKey(trimmed)}`, accInfo);
                }
            });

            // 3. Tentar remover sufixo de CNPJ/CPF (ex: " - 0001-39")
            const nameWithoutCnpj = credorName.replace(/\s*-\s*(\d{2,4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2})$/, '');
            if (nameWithoutCnpj !== credorName) {
                accountingMap.set(`${docNumberClean}-${nameWithoutCnpj.trim()}`, accInfo);
                accountingMap.set(`${docNumberClean}-${normalizeKey(nameWithoutCnpj)}`, accInfo);
            }
            
            let finalCode = credorCode;
            if (!finalCode) {
                const match = credorName.match(/^(\d+)\s*-/);
                if (match) finalCode = match[1];
            }
            
            if (finalCode) {
                accountingMap.set(`${docNumberClean}-${finalCode}`, accInfo);
            }

            payableAccountingDebugKeys.push({
                'Chave de Depuração': `${docNumberClean}-${finalCode || credorName}`,
                'Coluna Credor': credorName,
                'Coluna Documento': docValue,
                'Contas Encontradas': consolidatedAccount,
            });
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

    let headerRowIndex = -1;
    let credorIndex = -1;
    let codeIndex = -1;
    let docIndex = -1;

    for (let i = 0; i < paidSheetData.length; i++) {
        const row = paidSheetData[i];
        if (Array.isArray(row)) {
            const rowKeys = Array.from(row).map(cell => normalizeKey(cell));
            const hasCredor = rowKeys.some(k => k === 'credor' || k === 'fornecedor' || k === 'forn' || k === 'parceiro' || k.includes('nome do credor'));
            const hasDoc = rowKeys.some(k => k && (
                k === 'documento' || k.includes('documento') || k.includes('numerodanota') || 
                k === 'nota' || k === 'nf' || k === 'numnota' || k === 'nrdoc' || k === 'título'
            ));
            
            if (hasCredor && hasDoc) {
                headerRowIndex = i;
                credorIndex = rowKeys.findIndex(k => k === 'credor' || k === 'fornecedor' || k === 'forn' || k === 'parceiro' || k.includes('nome do credor'));
                codeIndex = rowKeys.findIndex(k => k && (k.includes('cdcred') || k.includes('codcredor') || k.includes('codigo')));
                docIndex = rowKeys.findIndex(k => k && (
                    k === 'documento' || k.includes('documento') || k.includes('numerodanota') || 
                    k === 'nota' || k === 'nf' || k === 'numnota' || k === 'nrdoc' || k === 'título'
                ));
                break;
            }
        }
    }

    // Se não encontrou cabeçalho, tenta o formato padrão de índices
    const useIndices = headerRowIndex === -1;
    const startIdx = useIndices ? 0 : headerRowIndex + 1;
    const finalCredorIdx = (useIndices || credorIndex === -1) ? 0 : credorIndex;
    const finalCodeIdx = (useIndices || codeIndex === -1) ? 1 : codeIndex;
    const finalDocIdx = (useIndices || docIndex === -1) ? 2 : docIndex;

    for (let i = startIdx; i < paidSheetData.length; i++) {
        const currentRow = paidSheetData[i];
        if (!Array.isArray(currentRow)) continue;

        // Garante que o array tenha o tamanho necessário antes de acessar
        const maxIdx = Math.max(finalCredorIdx, finalDocIdx, finalCodeIdx);
        if (currentRow.length <= maxIdx) continue;

        const firstCell = String(currentRow[finalCredorIdx] || '').trim();
        const thirdCell = String(currentRow[finalDocIdx] || '').trim();

        const isHeaderOrFooter = ["empresa", "período", "credor", "documento", "data da baixa", "total do dia"].some(keyword => normalizeKey(firstCell).startsWith(keyword));
        if (isHeaderOrFooter || !firstCell || !thirdCell) {
            continue;
        }

        const appropriations: { account: string; description: string }[] = [];
        let nextRowIdx = i + 1;
        
        while (nextRowIdx < paidSheetData.length) {
            const nextRow = paidSheetData[nextRowIdx];
            if (!nextRow || !Array.isArray(nextRow)) break;
            
            // Procura "Apropriações:" em qualquer lugar da linha
            const hasAppropriationLabel = nextRow.some(cell => 
                String(cell || '').trim().toLowerCase().includes('apropriações:')
            );
            
            const isEmptyFirstCell = String(nextRow[0] || '').trim() === '' && nextRow.some(cell => String(cell || '').trim() !== '');
            
            if (hasAppropriationLabel || isEmptyFirstCell) {
                let accountInfo = '';
                for (let k = 0; k < nextRow.length; k++) {
                    const cellValue = String(nextRow[k] || '').trim();
                    if (cellValue.match(/^(\d{1,2}\.\d{2}\.\d{2}\.\d{2})/)) {
                        accountInfo = cellValue;
                        break;
                    }
                }

                if (accountInfo) {
                    const parts = accountInfo.split(' - ');
                    const account = parts[0];
                    const description = parts.slice(1).join(' - ');
                    if (!appropriations.some(a => a.account === account)) {
                        appropriations.push({ account, description });
                    }
                }
                nextRowIdx++;
            } else {
                break;
            }
        }

        if (appropriations.length > 0) {
            const docNumberClean = cleanAndToStr(thirdCell).replace(/^0+/, '');
            const credorName = firstCell;
            const credorCode = finalCodeIdx !== -1 ? String(currentRow[finalCodeIdx] || '').trim() : '';
            
            const consolidatedAccount = appropriations.map(a => a.account).join(' / ');
            const consolidatedDesc = appropriations.map(a => a.description).join(' / ');
            const formattedFull = appropriations.map(a => `${a.account} - ${a.description}`).join(' / ');
            const accInfo = { 
                account: consolidatedAccount, 
                description: consolidatedDesc,
                formattedFull: formattedFull
            };

            // 1. Chave com Nome Original e Normalizado
            accountingMap.set(`${docNumberClean}-${credorName.trim()}`, accInfo);
            accountingMap.set(`${docNumberClean}-${normalizeKey(credorName)}`, accInfo);

            // 2. Chave com Código (se disponível)
            let finalCode = credorCode;
            if (!finalCode) {
                const match = credorName.match(/^(\d+)\s*-/);
                if (match) finalCode = match[1];
            }
            if (finalCode) {
                accountingMap.set(`${docNumberClean}-${finalCode}`, accInfo);
            }

            // 3. Chave com Nome sem o Código (se houver código)
            const nameMatch = credorName.match(/^(\d+)\s*-\s*(.*)$/);
            let nameOnly = credorName;
            if (nameMatch) {
                nameOnly = nameMatch[2].trim();
                accountingMap.set(`${docNumberClean}-${nameOnly}`, accInfo);
                accountingMap.set(`${docNumberClean}-${normalizeKey(nameOnly)}`, accInfo);
            } else {
                // Tenta remover sufixos comuns de CNPJ se existirem
                nameOnly = credorName.split(' - ')[0].trim();
                if (nameOnly !== credorName) {
                    accountingMap.set(`${docNumberClean}-${nameOnly}`, accInfo);
                    accountingMap.set(`${docNumberClean}-${normalizeKey(nameOnly)}`, accInfo);
                }
            }

            // 4. Indexar apenas pelo credor (para fallbacks sem documento)
            accountingMap.set(normalizeKey(nameOnly), accInfo as any);
            accountingMap.set(normalizeKey(credorName), accInfo as any);
            if (finalCode) accountingMap.set(finalCode, accInfo as any);

            paidAccountingDebugKeys.push({
                'Chave de Depuração': `${docNumberClean}-${finalCode || credorName}`,
                'Coluna Credor': credorName,
                'Coluna Documento': thirdCell,
                'Contas Encontradas': consolidatedAccount,
            });
        }
    }

    return { accountingMap, paidAccountingDebugKeys };
}