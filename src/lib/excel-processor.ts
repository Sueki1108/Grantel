
import { cfopDescriptions } from './cfop';
import type { KeyCheckResult } from '@/components/app/key-checker';
import type { AllClassifications } from '@/lib/types';
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
    otherSiengeItems: { [esp: string]: any[] };
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

    const notasValidas: any[] = [];
    const devolucoesDeCompra: any[] = []; 
    const devolucoesDeClientes: any[] = []; 
    const remessasEretornos: any[] = []; 

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

export function runReconciliation(
    siengeData: any[] | null,
    xmlItems: any[],
    nfeEntradas: any[],
    cteData: any[],
    costCenterMap?: Map<string, string> | null
): ReconciliationResults {
    const emptyResult = { reconciled: [], onlyInSienge: [], onlyInXml: [], devolucoesEP: [], otherSiengeItems: {}, debug: { costCenterKeys: [], siengeKeys: [] } };

    if (!siengeData || !xmlItems) {
        return { ...emptyResult, onlyInSienge: siengeData || [], onlyInXml: xmlItems || [] };
    }

    try {
        const findHeader = (data: any[], possibleNames: string[]): string | undefined => {
            if (!data || data.length === 0 || !data[0]) return undefined;
            const headers = Object.keys(data[0]);
            return headers.find(h => possibleNames.some(p => normalizeKey(h) === normalizeKey(p)));
        };

        const h = {
            credor: findHeader(siengeData, ['credor', 'fornecedor']),
            numero: findHeader(siengeData, ['número', 'numero', 'numero da nota', 'nota fiscal']),
            valorTotal: findHeader(siengeData, ['valor total', 'valor', 'vlr total']),
            cfop: findHeader(siengeData, ['cfop']),
            esp: findHeader(siengeData, ['esp']),
            cnpj: findHeader(siengeData, ['cpf/cnpj', 'cpf/cnpj do fornecedor']),
        };
        
        if (!h.credor || !h.numero || !h.valorTotal || !h.cnpj) {
            throw new Error("Não foi possível encontrar as colunas essenciais ('Credor', 'Número', 'CPF/CNPJ', 'Valor Total') na planilha Sienge.");
        }

        const xmlMap = new Map<string, {item: any, index: number}[]>();
        xmlItems.forEach((item, index) => {
            const numNota = cleanAndToStr(item['Número da Nota']);
            const cnpjEmitente = cleanAndToStr(item['CPF/CNPJ do Emitente']);
            const valorTotal = parseFloat(String(item['Valor Total'] || '0').replace(',', '.')).toFixed(2);

            if (numNota && cnpjEmitente) {
                const key = `${numNota}-${cnpjEmitente}-${valorTotal}`;
                if (!xmlMap.has(key)) xmlMap.set(key, []);
                xmlMap.get(key)!.push({ item, index });
            }
        });

        const reconciled: any[] = [];
        const siengeMatchedIndices = new Set<number>();
        const nfeHeaderMap = new Map((nfeEntradas || []).map(n => [n['Chave Unica'], n]));

        siengeData.forEach((siengeItem, siengeIndex) => {
            const numNota = cleanAndToStr(siengeItem[h.numero!]);
            const cnpj = cleanAndToStr(siengeItem[h.cnpj!]);
            const valorTotal = parseFloat(String(siengeItem[h.valorTotal!] || '0').replace(',', '.')).toFixed(2);

            if (numNota && cnpj) {
                const key = `${numNota}-${cnpj}-${valorTotal}`;
                const xmlMatches = xmlMap.get(key);

                if (xmlMatches && xmlMatches.length > 0) {
                    const xmlMatch = xmlMatches.shift()!; 
                    const xmlItem = xmlMatch.item;
                    
                    siengeMatchedIndices.add(siengeIndex);
                    
                    const nfeHeader = nfeHeaderMap.get(xmlItem['Chave Unica']);
                    const chaveAcesso = xmlItem['Chave de acesso'];

                    reconciled.push({
                        ...xmlItem,
                        Fornecedor: nfeHeader?.Fornecedor || 'N/A',
                        'Sienge_CFOP': siengeItem[h.cfop!],
                        'Sienge_Esp': siengeItem[h.esp!],
                        'Centro de Custo': costCenterMap?.get(chaveAcesso) || 'N/A',
                        'Observações': `Conciliado via Valor Total`
                    });
                }
            }
        });
        
        const onlyInSiengeRaw = siengeData.filter((_, index) => !siengeMatchedIndices.has(index));
        
        const onlyInSienge = onlyInSiengeRaw.filter(item => {
            const esp = item[h.esp!] || '';
            return esp.toUpperCase() === 'NFE' || esp.toUpperCase() === 'NFSR';
        });

        const otherSiengeItems = onlyInSiengeRaw.filter(item => {
            const esp = item[h.esp!] || '';
            return esp.toUpperCase() !== 'NFE' && esp.toUpperCase() !== 'NFSR';
        }).reduce((acc, item) => {
            const esp = item[h.esp!] || 'Sem Tipo';
            if(!acc[esp]) acc[esp] = [];
            acc[esp].push(item);
            return acc;
        }, {} as {[esp: string]: any[]});
        
        const allMatchedXmlIndices = reconciled.map(r => xmlItems.findIndex(x => x.id === r.id)).filter(i => i !== -1);
        const onlyInXml = xmlItems.filter((_, index) => !allMatchedXmlIndices.includes(index));

        const devolucoesEP = xmlItems
            .filter(item => {
                const cfop = cleanAndToStr(item.CFOP);
                const natOp = (item['Natureza da Operação'] || '').toUpperCase();
                return (cfop.startsWith('5') || cfop.startsWith('6')) && natOp.includes('DEVOLUCAO');
            })
            .map(item => ({
                'Número da Nota de Devolução': item['Número da Nota'],
                'Fornecedor': item.Fornecedor,
                'Valor': item['Valor Total'],
                'Data Emissão': item.Emissão,
                'Chave da Nota Original': cleanAndToStr(item['refNFe']) || 'Não encontrada no XML',
            }));
            
        return { reconciled, onlyInSienge, onlyInXml, devolucoesEP, otherSiengeItems, debug: emptyResult.debug };
    } catch (err: any) {
        console.error("Reconciliation Error:", err);
        return { ...emptyResult, onlyInSienge: siengeData || [], onlyInXml: xmlItems };
    }
}


export function generateSiengeDebugKeys(siengeData: any[]) {
    const findHeader = (data: any[], possibleNames: string[]): string | undefined => {
        if (!data || data.length === 0 || !data[0]) return undefined;
        const headers = Object.keys(data[0]);
        return headers.find(h => possibleNames.some(p => normalizeKey(h) === normalizeKey(p)));
    };
    const h = {
        numero: findHeader(siengeData, ['número', 'numero', 'numero da nota', 'nota fiscal']),
        valorTotal: findHeader(siengeData, ['valor total', 'valor', 'vlr total']),
        cnpj: findHeader(siengeData, ['cpf/cnpj', 'cpf/cnpj do fornecedor']),
    };
    if (!h.numero || !h.valorTotal || !h.cnpj) return [];

    return siengeData.map(item => {
        const numNota = cleanAndToStr(item[h.numero!]);
        const cnpj = cleanAndToStr(item[h.cnpj!]);
        const valorTotal = parseFloat(String(item[h.valorTotal!] || '0').replace(',', '.')).toFixed(2);
        const key = `${numNota}-${cnpj}-${valorTotal}`;
        
        return { 
            "Chave de Comparação Sienge": key,
            "Número (Original)": item[h.numero!],
            "CNPJ (Original)": item[h.cnpj!],
            "Valor (Original)": item[h.valorTotal!]
        }
    });
}

export function processCostCenterData(costCenterSheetData: any[][]): {
    costCenterMap: Map<string, string>;
    debugKeys: any[];
    allCostCenters: string[];
    costCenterHeaderRows: any[];
} {
    const costCenterMap = new Map<string, string>();
    const debugKeys: any[] = [];
    let allCostCenters = new Set<string>();
    const costCenterHeaderRows: any[] = [];

    if (!costCenterSheetData || costCenterSheetData.length === 0) {
        return { costCenterMap, debugKeys, allCostCenters: [], costCenterHeaderRows: [] };
    }

    let currentCostCenter = 'N/A';
    let isDataSection = false;

    costCenterSheetData.forEach((row, rowIndex) => {
        if (!Array.isArray(row) || row.length === 0) {
            isDataSection = false;
            return;
        }

        const firstCell = String(row[0] || '').trim();
        const debugEntry: any = {
            "Linha": rowIndex + 1,
            "Conteúdo Coluna A": row[0] ?? 'Vazio',
            "Conteúdo Coluna C": row[2] ?? 'Vazio',
            "Conteúdo Coluna E": row[4] ?? 'Vazio',
            "Conteúdo Coluna F": row[5] ?? 'Vazio',
            "Centro de Custo Ativo": currentCostCenter,
            "Status": "Ignorado",
            "Motivo": "Linha não corresponde a um cabeçalho ou a uma linha de dados válida.",
        };

        if (firstCell.toLowerCase().startsWith('centro de custo')) {
            currentCostCenter = firstCell;
            allCostCenters.add(currentCostCenter);
            isDataSection = false;
            debugEntry.Status = "Info";
            debugEntry.Motivo = "Linha identificada como um novo centro de custo.";
        } else if (firstCell.toLowerCase() === 'item') {
            isDataSection = true;
            costCenterHeaderRows.push({ center: currentCostCenter, headers: row });
            debugEntry.Status = "Info";
            debugEntry.Motivo = "Linha identificada como cabeçalho de dados.";
        } else if (isDataSection && typeof row[0] === 'number') {
            const obsRaw = row[5]; 
            const chaveAcessoMatch = String(obsRaw || '').match(/(\d{44})/);

            if (chaveAcessoMatch) {
                const chaveAcesso = chaveAcessoMatch[1];
                costCenterMap.set(chaveAcesso, currentCostCenter);
                debugEntry.Status = "Sucesso";
                debugEntry.Motivo = `Chave de acesso ${chaveAcesso} mapeada para o centro de custo ${currentCostCenter}.`;
                debugEntry["Chave de Acesso Extraída"] = chaveAcesso;
            } else {
                debugEntry.Status = "Falha";
                debugEntry.Motivo = "Coluna de Observação (F) não continha uma chave de 44 dígitos.";
            }
        }

        debugKeys.push(debugEntry);
    });

    return { costCenterMap, debugKeys, allCostCenters: Array.from(allCostCenters), costCenterHeaderRows };
}
