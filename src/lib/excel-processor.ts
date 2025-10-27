import { cfopDescriptions } from './cfop';
import * as XLSX from 'xlsx';
import { KeyCheckResult } from '@/components/app/key-checker';
import { type AllClassifications } from '@/components/app/imobilizado-analysis';
import type { XmlFileContent } from '@/components/app/history-analysis';

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

export interface ProcessedData {
    sheets: DataFrames;
    spedInfo: SpedInfo | null;
    siengeSheetData: any[] | null;
    keyCheckResults: KeyCheckResult | null;
    saidasStatus?: Record<number, 'emitida' | 'cancelada' | 'inutilizada'>;
    lastSaidaNumber?: number;
    imobilizadoClassifications?: AllClassifications;
    xmlFileContents?: {
        nfeEntrada: XmlFileContent[];
        cte: XmlFileContent[];
        nfeSaida: XmlFileContent[];
        nfse: XmlFileContent[];
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

export function processDataFrames(dfs: DataFrames, eventCanceledKeys: Set<string>, log: LogFunction): Omit<ProcessedData, 'fileNames'> {
    
    log("Iniciando preparação dos dados no navegador...");
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
    
    log("Identificando notas de devolução de fornecedor (finNFe=4)...");
    const chavesDevolucaoFornecedor = new Set<string>();
    nfe.forEach(nota => {
        if (nota.finNFe === '4') {
            chavesDevolucaoFornecedor.add(cleanAndToStr(nota['Chave de acesso']));
        }
    });
    log(`- ${chavesDevolucaoFornecedor.size} notas de devolução para fornecedor (finNFe=4) identificadas.`);
    
    log("Identificando notas de remessa e retorno...");
    const chavesRemessaRetorno = new Set<string>();
    const remessaCfopPrefixes = ['190', '191', '192', '290', '291', '292', '590', '591', '592', '690', '691', '692'];
    itens.forEach(item => {
        if (!item || !item.CFOP) return;
        const cfop = cleanAndToStr(item.CFOP);
        if (remessaCfopPrefixes.some(prefix => cfop.startsWith(prefix))) {
            chavesRemessaRetorno.add(cleanAndToStr(item['Chave de acesso']));
        }
    });
     log(`- ${chavesRemessaRetorno.size} chaves de remessa/retorno identificadas via CFOP dos itens.`);


    log("Coletando chaves de exceção (canceladas, manifesto)...");
    const chavesExcecao = new Set<string>(eventCanceledKeys);
    log(`- ${eventCanceledKeys.size} chaves de cancelamento por evento de XML adicionadas.`);

    const addExceptions = (df: DataFrame, chaveKey: string, statusKey?: string) => {
        df.forEach(row => {
            if (!row) return;
            const statusVal = statusKey ? row[statusKey] : '';
            const isCancelled = typeof statusVal === 'string' && statusVal.toLowerCase().includes('cancelada');
            const statusOk = statusKey ? isCancelled : true;
            const chave = cleanAndToStr(row[chaveKey]) || cleanAndToStr(row['Chave de acesso']);
            if (statusOk && chave) {
                chavesExcecao.add(chave);
            }
        });
    };
    
    addExceptions(nfe, "Chave de acesso", "Status");
    addExceptions(cte, "Chave de acesso", "Status");
    addExceptions(saidas, "Chave de acesso", "Status");
    
    addExceptions(naoRealizada, "Chave de acesso");
    addExceptions(desconhecida, "Chave de acesso");
    addExceptions(desacordo, "Chave de acesso");

    log(`- Total de ${chavesExcecao.size} chaves de exceção (canceladas/manifesto) coletadas.`);

    log("Filtrando notas e itens válidos...");
    
    const isChaveValida = (row: any) => {
        if(!row) return false;
        const chaveAcesso = cleanAndToStr(row['Chave de acesso']);
        return chaveAcesso && 
               !chavesExcecao.has(chaveAcesso) && 
               !chavesDevolucaoFornecedor.has(chaveAcesso) &&
               !chavesRemessaRetorno.has(chaveAcesso);
    }
    
    const nfeFiltrada = nfe.filter(row => row && !Object.values(row).some(v => typeof v === 'string' && v.toUpperCase().includes("TOTAL")));
    const cteFiltrado = cte.filter(row => row && !Object.values(row).some(v => typeof v === 'string' && v.toUpperCase().includes("TOTAL")));
    
    let notasValidas = nfeFiltrada.filter(isChaveValida);
    let ctesValidos = cteFiltrado.filter(isChaveValida);
    let saidasValidas = saidas.filter(isChaveValida);
    
    log(`- Total de ${notasValidas.length} NF-es válidas.`);
    log(`- Total de ${ctesValidos.length} CT-es válidos.`);
    log(`- Total de ${saidasValidas.length} saídas válidas.`);
    
    const chavesNotasValidas = new Set(notasValidas.map(row => cleanAndToStr(row["Chave Unica"])));
    let itensValidos = itens.filter(item => chavesNotasValidas.has(cleanAndToStr(item["Chave Unica"])));
    log(`- ${itensValidos.length} itens válidos de entrada correspondentes.`);

    const chavesSaidasValidas = new Set(saidasValidas.map(row => cleanAndToStr(row["Chave Unica"])));
    const itensValidosSaidas = itensSaidas.filter(item => chavesSaidasValidas.has(cleanAndToStr(item["Chave Unica"])));
    log(`- ${itensValidosSaidas.length} itens de saída válidos correspondentes.`);
    
    log("Identificando itens para análise de imobilizado...");
    const remessaConsertoCfopPrefixes = ['1915', '2915', '1916', '2916', '5915', '6915', '5916', '6916'];
    const itensParaImobilizado = itensValidos.filter(item => {
        if (!item || !item['Valor Unitário']) return false;
        
        const cfop = cleanAndToStr(item.CFOP);
        // Verifica se o CFOP NÃO é de remessa/retorno/conserto
        const isRemessaConserto = remessaConsertoCfopPrefixes.some(prefix => cfop.startsWith(prefix));

        const valorUnitario = parseFloat(String(item['Valor Unitário']));
        return valorUnitario > 1200 && !isRemessaConserto;
    });
    log(`- ${itensParaImobilizado.length} itens com valor unitário > R$ 1.200 (e não são remessas/conserto) encontrados para análise.`);

    const imobilizados = itensParaImobilizado.map((item) => {
        const uniqueItemId = `${cleanAndToStr(item['CPF/CNPJ do Emitente'])}-${cleanAndToStr(item['Código'])}`;
        const id = `${cleanAndToStr(item['Chave Unica'])}-${item['Item']}`;
        return { 
            ...item, 
            id: id,
            uniqueItemId: uniqueItemId,
        };
    });

    log("Agrupando resultados...");
    const notasCanceladas = [...nfe, ...cte, ...saidas].filter(row => {
        if (!row) return false;
        const chaveAcesso = cleanAndToStr(row['Chave de acesso']);
        const statusVal = row["Status"];
        const isCancelledByStatus = typeof statusVal === 'string' && statusVal.toLowerCase().includes('cancelada');
        // Adiciona à lista de canceladas se tiver o status OU estiver no set de exceções
        return isCancelledByStatus || chavesExcecao.has(chaveAcesso);
    });
    
    const remessasERetornos = nfe.filter(row => chavesRemessaRetorno.has(cleanAndToStr(row['Chave de acesso'])));
    const devolucoesDeCompra = nfe.filter(row => chavesDevolucaoFornecedor.has(cleanAndToStr(row['Chave de acesso'])));
    
    const devolucoesDeClientes = saidas.filter(row => {
        if (!row || !row['Chave Unica']) return false;
        const itensDestaNota = itensSaidas.filter(i => cleanAndToStr(i['Chave Unica']) === cleanAndToStr(row['Chave Unica']));
        return itensDestaNota.some(item => {
            if (!item || !item["CFOP"]) return false;
            const cfop = cleanAndToStr(item["CFOP"]);
            // Devoluções de Venda de Saída iniciam com 52, 62
            return cfop.startsWith('52') || cfop.startsWith('62');
        });
    });

    
    const chavesValidasEntrada = notasValidas.map(row => ({
        "Chave de acesso": cleanAndToStr(row["Chave de acesso"]),
        "Tipo": "NFE",
        "Fornecedor": row["Fornecedor"],
        "Emissão": String(row["Emissão"]).substring(0, 10),
        "Total": row['Total'] || 0,
        "destCNPJ": row.destCNPJ, "destIE": row.destIE, "destUF": row.destUF,
        "emitCNPJ": row.emitCNPJ, "emitName": row.emitName, "emitIE": row.emitIE,
    }));

    const chavesValidasCte = ctesValidos.map(row => ({
        "Chave de acesso": cleanAndToStr(row["Chave de acesso"]),
        "Tipo": "CTE",
        "Fornecedor": row["Fornecedor"],
        "Emissão": String(row["Emissão"]).substring(0, 10),
        "Total": row['Valor da Prestação'] || 0,
    }));

    const chavesValidasSaida = saidasValidas.map(row => ({
        "Chave de acesso": cleanAndToStr(row["Chave de acesso"]),
        "Tipo": 'Saída',
        "Fornecedor": row["Destinatário"], 
        "Emissão": String(row["Emissão"]).substring(0, 10),
        "Total": row['Total'] || 0,
    }));

    const chavesValidas = [...chavesValidasEntrada, ...chavesValidasCte, ...chavesValidasSaida];
    log(`- ${chavesValidas.length} chaves válidas para verificação SPED geradas.`);
    
    const finalResult: DataFrames = {
        "Notas Válidas": notasValidas,
        "CTEs Válidos": ctesValidos,
        "Itens Válidos": itensValidos, 
        "Chaves Válidas": chavesValidas,
        "Saídas": saidasValidas, 
        "Itens Válidos Saídas": itensValidosSaidas,
        "Imobilizados": imobilizados,
        "Remessas e Retornos": remessasERetornos,
        "Devoluções de Compra (Fornecedor)": devolucoesDeCompra,
        "Devoluções de Clientes": devolucoesDeClientes,
        "Notas Canceladas": notasCanceladas,
        ...originalDfs 
    };
    
    const addCfopDescriptionToRow = (row: any) => {
        if (!row || typeof row !== 'object' || !row['CFOP']) {
            return { ...row, 'Descricao CFOP': 'N/A' };
        }
        const cfopCode = parseInt(cleanAndToStr(row['CFOP']), 10);
        const fullDescription = cfopDescriptions[cfopCode] || 'Descrição não encontrada';
        const shortDescription = fullDescription.split(' ').slice(0, 3).join(' ');

        const newRow: { [key: string]: any } = {};
        const cfopIndex = Object.keys(row).indexOf('CFOP');

        Object.keys(row).forEach((key, index) => {
            newRow[key] = row[key];
            if (index === cfopIndex) {
                 newRow['Descricao CFOP'] = shortDescription;
            }
        });
        return newRow;
    };
    
    const finalSheetSet: DataFrames = {};
    const displayOrder = [
        "Notas Válidas", "CTEs Válidos", "Itens Válidos", "Chaves Válidas", "Saídas", "Itens Válidos Saídas",
        "Imobilizados", "Remessas e Retornos", "Devoluções de Compra (Fornecedor)", "Devoluções de Clientes", "Notas Canceladas", ...Object.keys(originalDfs)
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
    };
}
