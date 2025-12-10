
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
            cnpj: findHeader(siengeData, ['cpf/cnpj', 'cpf/cnpj do fornecedor']),
            numero: findHeader(siengeData, ['número', 'numero', 'numero da nota', 'nota fiscal']),
            valorTotal: findHeader(siengeData, ['valor total', 'valor', 'vlr total']),
            esp: findHeader(siengeData, ['esp']),
            icmsOutras: findHeader(siengeData, ['icms outras', 'icmsoutras']),
            desconto: findHeader(siengeData, ['desconto']),
            frete: findHeader(siengeData, ['frete']),
            ipiDespesas: findHeader(siengeData, ['ipi despesas', 'ipidespesas']),
            icmsSt: findHeader(siengeData, ['icms-st', 'icms st', 'valor icms st', 'vlr icms st', 'vlr icms subst']),
            despesasAcessorias: findHeader(siengeData, ['despesas acessórias', 'despesasacessorias', 'voutro']),
            precoUnitario: findHeader(siengeData, ['preço unitário', 'preco unitario', 'valor unitario', 'vlr unitario']),
            produtoFiscal: findHeader(siengeData, ['produto fiscal', 'descrição do item', 'descrição']),
            cfop: findHeader(siengeData, ['cfop']),
        };

        if (!h.cnpj || !h.numero || !h.valorTotal || !h.esp) {
            throw new Error("Não foi possível encontrar as colunas essenciais ('CPF/CNPJ', 'Número', 'Valor Total', 'Esp') na planilha Sienge.");
        }

        const filteredSiengeData = siengeData.filter(row => {
            const espValue = row[h.esp!] ? String(row[h.esp!]).trim().toUpperCase() : '';
            return espValue === 'NFE' || espValue === 'NFSR';
        });

        const otherSiengeItems = siengeData.filter(row => {
            const espValue = row[h.esp!] ? String(row[h.esp!]).trim().toUpperCase() : '';
            return espValue !== 'NFE' && espValue !== 'NFSR';
        }).reduce((acc, item) => {
            const esp = item[h.esp!] || 'Sem Tipo';
            if(!acc[esp]) acc[esp] = [];
            acc[esp].push(item);
            return acc;
        }, {} as {[esp: string]: any[]});

        
        const nfeHeaderMap = new Map((nfeEntradas || []).map(n => [n['Chave Unica'], n]));
        
        let remainingXmlItems = xmlItems.map(item => {
            const header = nfeHeaderMap.get(item['Chave Unica']);
            return {
                ...item,
                Fornecedor: header?.Fornecedor || 'N/A',
            };
        });
        
        let remainingSiengeItems = [...filteredSiengeData];
        const reconciled: any[] = [];

        const getComparisonKey = (numero: any, cnpj: any, valor: any): string | null => {
            const cleanNumero = cleanAndToStr(numero);
            const cleanCnpj = String(cnpj).replace(/\D/g, '');
            const cleanValor = parseFloat(String(valor || '0').replace(',', '.')).toFixed(2);
            if (!cleanNumero || !cleanCnpj || cleanValor === 'NaN') return null;
            return `${cleanNumero}-${cleanCnpj}-${cleanValor}`;
        };

        const reconciliationPass = (
            siengeItems: any[],
            xmlItems: any[],
            getSiengeKey: (item: any) => string | null,
            getXmlKey: (item: any) => string | null,
            passName: string
        ) => {
            const matchedInPass: any[] = [];
            const stillUnmatchedSienge: any[] = [];
            const xmlMap = new Map<string, {item: any; index: number}[]>();

            xmlItems.forEach((item, index) => {
                const key = getXmlKey(item);
                if (key) {
                    if (!xmlMap.has(key)) xmlMap.set(key, []);
                    xmlMap.get(key)!.push({ item, index });
                }
            });

            const matchedXmlIndices = new Set<number>();

            siengeItems.forEach(siengeItem => {
                const key = getSiengeKey(siengeItem);
                if (key && xmlMap.has(key)) {
                    const matches = xmlMap.get(key)!;
                    if (matches.length > 0) {
                        const match = matches.shift()!;
                        const chaveAcesso = match.item['Chave de acesso'];
                        
                        matchedInPass.push({
                            ...match.item,
                            'Sienge_CFOP': siengeItem[h.cfop!] || 'N/A',
                            'Sienge_Esp': siengeItem[h.esp!],
                            'Centro de Custo': costCenterMap?.get(chaveAcesso) || 'N/A',
                            'Observações': `Conciliado via ${passName}`,
                            xmlIndex: match.index
                        });
                        
                        matchedXmlIndices.add(match.index);
                        return;
                    }
                }
                stillUnmatchedSienge.push(siengeItem);
            });
            
            const stillUnmatchedXml = xmlItems.filter((_, index) => !matchedXmlIndices.has(index));
            
            return { matched: matchedInPass, remainingSienge: stillUnmatchedSienge, remainingXml: stillUnmatchedXml };
        };

        const passes = [
            { name: "Valor Total", getSiengeKey: (item: any) => getComparisonKey(item[h.numero!], item[h.cnpj!], item[h.valorTotal!]), getXmlKey: (item: any) => getComparisonKey(item['Número da Nota'], item['CPF/CNPJ do Emitente'], item['Valor Total']) },
            { name: "Preço Unitário", getSiengeKey: (item: any) => h.precoUnitario ? getComparisonKey(item[h.numero!], item[h.cnpj!], item[h.precoUnitario!]) : null, getXmlKey: (item: any) => getComparisonKey(item['Número da Nota'], item['CPF/CNPJ do Emitente'], item['Valor Unitário']) },
            { name: "ICMS Outras", getSiengeKey: (item: any) => h.icmsOutras ? getComparisonKey(item[h.numero!], item[h.cnpj!], item[h.icmsOutras!]) : null, getXmlKey: (item: any) => getComparisonKey(item['Número da Nota'], item['CPF/CNPJ do Emitente'], item['Valor Total']) },
            { name: "Valor Total + Desconto", getSiengeKey: (item: any) => h.desconto ? getComparisonKey(item[h.numero!], item[h.cnpj!], parseFloat(String(item[h.valorTotal!] || '0').replace(',', '.')) + parseFloat(String(item[h.desconto!] || '0').replace(',', '.'))) : null, getXmlKey: (item: any) => getComparisonKey(item['Número da Nota'], item['CPF/CNPJ do Emitente'], item['Valor Total']) },
            { name: "Valor Total - Frete", getSiengeKey: (item: any) => h.frete ? getComparisonKey(item[h.numero!], item[h.cnpj!], parseFloat(String(item[h.valorTotal!] || '0').replace(',', '.')) - parseFloat(String(item[h.frete!] || '0').replace(',', '.'))) : null, getXmlKey: (item: any) => getComparisonKey(item['Número da Nota'], item['CPF/CNPJ do Emitente'], item['Valor Total']) },
            { name: "Valor Total - IPI/ICMS ST", getSiengeKey: (item: any) => (h.ipiDespesas || h.icmsSt) ? getComparisonKey(item[h.numero!], item[h.cnpj!], parseFloat(String(item[h.valorTotal!] || '0').replace(',', '.')) - (h.ipiDespesas ? parseFloat(String(item[h.ipiDespesas] || '0').replace(',', '.')) : 0) - (h.icmsSt ? parseFloat(String(item[h.icmsSt] || '0').replace(',', '.')) : 0)) : null, getXmlKey: (item: any) => getComparisonKey(item['Número da Nota'], item['CPF/CNPJ do Emitente'], item['Valor Total']) },
            { name: "Valor Total - Frete/IPI", getSiengeKey: (item: any) => (h.frete || h.ipiDespesas) ? getComparisonKey(item[h.numero!], item[h.cnpj!], parseFloat(String(item[h.valorTotal!] || '0').replace(',', '.')) - (h.frete ? parseFloat(String(item[h.frete] || '0').replace(',', '.')) : 0) - (h.ipiDespesas ? parseFloat(String(item[h.ipiDespesas] || '0').replace(',', '.')) : 0)) : null, getXmlKey: (item: any) => getComparisonKey(item['Número da Nota'], item['CPF/CNPJ do Emitente'], item['Valor Total']) },
            { name: "Valor Total + Desc - Frete", getSiengeKey: (item: any) => (h.desconto || h.frete) ? getComparisonKey(item[h.numero!], item[h.cnpj!], parseFloat(String(item[h.valorTotal!] || '0').replace(',', '.')) + (h.desconto ? parseFloat(String(item[h.desconto] || '0').replace(',', '.')) : 0) - (h.frete ? parseFloat(String(item[h.frete] || '0').replace(',', '.')) : 0)) : null, getXmlKey: (item: any) => getComparisonKey(item['Número da Nota'], item['CPF/CNPJ do Emitente'], item['Valor Total']) },
            { name: "Valor Total - Desp. Acess.", getSiengeKey: (item: any) => h.despesasAcessorias ? getComparisonKey(item[h.numero!], item[h.cnpj!], parseFloat(String(item[h.valorTotal!] || '0').replace(',', '.')) - parseFloat(String(item[h.despesasAcessorias!] || '0').replace(',', '.'))) : null, getXmlKey: (item: any) => getComparisonKey(item['Número da Nota'], item['CPF/CNPJ do Emitente'], item['Valor Total']) },
        ];
        
        for (const pass of passes) {
             if (remainingSiengeItems.length === 0 || remainingXmlItems.length === 0) break;
             const passResult = reconciliationPass(remainingSiengeItems, remainingXmlItems, pass.getSiengeKey, pass.getXmlKey, pass.name);
             if (passResult.matched.length > 0) {
                 reconciled.push(...passResult.matched);
                 remainingSiengeItems = passResult.remainingSienge;
                 remainingXmlItems = passResult.remainingXml;
             }
        }
        
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

        return { reconciled, onlyInSienge: remainingSiengeItems, onlyInXml: remainingXmlItems, devolucoesEP, otherSiengeItems, debug: emptyResult.debug };

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
    const allCostCenters = new Set<string>();
    const costCenterHeaderRows: any[] = [];

    if (!costCenterSheetData || costCenterSheetData.length === 0) {
        return { costCenterMap, debugKeys, allCostCenters: [], costCenterHeaderRows: [] };
    }

    let currentCostCenter = 'N/A';
    let isDataSection = false;

    costCenterSheetData.forEach((row, rowIndex) => {
        if (!Array.isArray(row) || row.length < 6) return;

        const firstCell = String(row[0] || '').trim();
        const debugEntry: any = {
            "Linha": rowIndex + 1, "Coluna A": row[0] ?? 'Vazio', "Coluna B": row[1] ?? 'Vazio', "Coluna D": row[3] ?? 'Vazio',
            "Centro de Custo Ativo": currentCostCenter, "Status": "Ignorado",
            "Motivo": "Linha não corresponde a um cabeçalho de centro de custo ou a uma linha de dados válida.",
        };

        if (firstCell.toLowerCase().startsWith('centro de custo')) {
            currentCostCenter = firstCell;
            allCostCenters.add(currentCostCenter);
            isDataSection = false; // Reset data section flag
            debugEntry.Status = "Info";
            debugEntry.Motivo = "Linha identificada como um novo cabeçalho de centro de custo.";
        } else if (isDataSection && typeof row[0] === 'number') { // Assuming 'Item' is a number
            const credor = row[1];
            const documento = row[3];
            
            if (credor && documento) {
                const cnpjMatch = String(credor).match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{11})/);
                const docMatch = String(documento).match(/NFSE\/(\d+)|NFE\s*\/(\d+)/i);

                const cnpj = cnpjMatch ? cnpjMatch[0].replace(/\D/g, '') : null;
                const docNumber = docMatch ? (docMatch[1] || docMatch[2]) : null;

                if (cnpj && docNumber) {
                     const key = `${cleanAndToStr(docNumber)}-${cleanAndToStr(cnpj)}`;
                     costCenterMap.set(key, currentCostCenter);
                      debugEntry.Status = "Sucesso";
                      debugEntry.Motivo = `Chave de dados '${key}' mapeada para o centro de custo ${currentCostCenter}.`;
                      debugEntry["Chave Gerada"] = key;
                } else {
                     debugEntry.Status = "Falha";
                     debugEntry.Motivo = "Não foi possível extrair CNPJ ou Número do Documento das colunas B e D.";
                }
            }
        } else if (normalizeKey(firstCell) === 'item') {
            isDataSection = true;
            costCenterHeaderRows.push({ center: currentCostCenter, headers: row });
            debugEntry.Status = "Info";
            debugEntry.Motivo = "Linha identificada como cabeçalho de dados, iniciando a leitura de dados.";
        }
        
        debugKeys.push(debugEntry);
    });

    return { costCenterMap, debugKeys, allCostCenters: Array.from(allCostCenters), costCenterHeaderRows };
}
