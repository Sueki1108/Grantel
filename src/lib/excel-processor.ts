import { cfopDescriptions } from './cfop';
import * as XLSX from 'xlsx';
import { KeyCheckResult } from '@/components/app/key-checker';

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
    imobilizadoStatus?: Record<string, 'unclassified' | 'imobilizado' | 'uso-consumo' | 'utilizado-em-obra'>;
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
    
    // As chaves podem ter nomes ligeiramente diferentes dependendo da fonte (XML vs. planilha)
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

export function processDataFrames(dfs: DataFrames, eventCanceledKeys: Set<string>, log: LogFunction): ProcessedData {
    
    log("Iniciando preparação dos dados no navegador...");
    const originalDfs: DataFrames = {};
    const processedDfs: DataFrames = {};

    const allSheetNames = [
        "NFE", "CTE", "Itens", "Saídas", "Itens Saídas",
        "NFE Operação Não Realizada", "NFE Operação Desconhecida", 
        "CTE Desacordo de Serviço"
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

    log("Identificando emissões próprias do fornecedor (devoluções)...");
    const chavesEmissaoPropriaEntrada = new Set<string>();
    itens.forEach(item => {
        if (!item || !item["CFOP"]) return;
        const cfop = cleanAndToStr(item["CFOP"]);
        // Regra: Qualquer CFOP de entrada iniciado com 1 ou 2 é considerado uma devolução/retorno.
        if (cfop.startsWith('1') || cfop.startsWith('2')) {
            chavesEmissaoPropriaEntrada.add(cleanAndToStr(item["Chave Unica"]));
        }
    });
    log(`- ${chavesEmissaoPropriaEntrada.size} chaves únicas de emissão própria de fornecedor (devolução) identificadas.`);

    log("Coletando chaves de exceção (canceladas, manifesto, eventos)...");
    const chavesExcecao = new Set<string>(eventCanceledKeys);
    log(`- ${eventCanceledKeys.size} chaves de cancelamento por evento adicionadas.`);

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
    
    // Adiciona canceladas encontradas nos XMLs/planilhas principais
    addExceptions(nfe, "Chave de acesso", "Status");
    addExceptions(cte, "Chave de acesso", "Status");
    addExceptions(saidas, "Chave de acesso", "Status");
    
    // Adiciona todas das planilhas de manifesto
    addExceptions(naoRealizada, "Chave de acesso");
    addExceptions(desconhecida, "Chave de acesso");
    addExceptions(desacordo, "Chave de acesso");

    log(`- Total de ${chavesExcecao.size} chaves de exceção coletadas (canceladas, manifesto, eventos).`);

    log("Filtrando notas e itens válidos...");
    
    const isChaveValida = (row: any) => {
        if(!row) return false;
        const chaveAcesso = cleanAndToStr(row['Chave de acesso']);
        return chaveAcesso && !chavesExcecao.has(chaveAcesso);
    }
    
    const nfeFiltrada = nfe.filter(row => row && !Object.values(row).some(v => typeof v === 'string' && v.toUpperCase().includes("TOTAL")));
    const cteFiltrado = cte.filter(row => row && !Object.values(row).some(v => typeof v === 'string' && v.toUpperCase().includes("TOTAL")));
    
    let notasValidas = nfeFiltrada.filter(row => isChaveValida(row) && !chavesEmissaoPropriaEntrada.has(cleanAndToStr(row["Chave Unica"])));
    let ctesValidos = cteFiltrado.filter(row => isChaveValida(row)); // CTes não são 'emissão própria' neste contexto
    let saidasValidas = saidas.filter(row => isChaveValida(row));
    
    log(`- Total de ${notasValidas.length} NF-es válidas (entradas de terceiros).`);
    log(`- Total de ${ctesValidos.length} CT-es válidos.`);
    
    const chavesNotasValidas = new Set(notasValidas.map(row => cleanAndToStr(row["Chave Unica"])));
    let itensValidos = itens.filter(item => {
        const chaveUnica = cleanAndToStr(item["Chave Unica"]);
        // Itens de emissão própria não são incluídos em "Itens Válidos".
        return chavesNotasValidas.has(chaveUnica) && !chavesEmissaoPropriaEntrada.has(chaveUnica);
    });
    log(`- ${itensValidos.length} itens válidos correspondentes.`);

    log("Identificando todos os itens com valor acima de R$ 1200,00 e filtrando remessas...");
    const remessaCfopsPrefixes = ['59', '69'];
    const itensAcimaDe1200 = itensValidos.filter(item => {
        const cfop = cleanAndToStr(item["CFOP"]);
        const valorTotal = item['Valor Total'] || 0;
        const isRemessa = remessaCfopsPrefixes.some(prefix => cfop.startsWith(prefix));
        return valorTotal > 1200 && !isRemessa;
    });
    log(`- ${itensAcimaDe1200.length} itens com valor total acima de 1200 (não remessa) encontrados.`);

    log("Designando itens de valor relevante para análise de Imobilizado...");
    // A lista de Imobilizados para análise é a mesma de Itens Acima de 1200
    const imobilizados = itensAcimaDe1200.map((item, index) => ({ 
        ...item, 
        id: `${cleanAndToStr(item['Chave Unica'])}-${index}` 
    }));
    log(`- ${imobilizados.length} itens designados para a aba de análise de Imobilizado.`);


    log(`- ${saidasValidas.length} saídas válidas encontradas.`);

    const chavesSaidasValidas = new Set(saidasValidas.map(row => cleanAndToStr(row["Chave Unica"])));
    const itensValidosSaidas = itensSaidas.filter(item => chavesSaidasValidas.has(cleanAndToStr(item["Chave Unica"])));
    log(`- ${itensValidosSaidas.length} itens de saída válidos correspondentes.`);

    log("Agrupando resultados...");
    const notasCanceladas = [...nfe, ...cte, ...saidas].filter(row => {
        if (!row) return false;
        const statusVal = row["Status"];
        const isCancelled = typeof statusVal === 'string' && statusVal.toLowerCase().includes('cancelada');
        return isCancelled || chavesExcecao.has(cleanAndToStr(row["Chave de acesso"]));
    });
    const emissaoPropria = [...nfeFiltrada, ...cteFiltrado].filter(row => chavesEmissaoPropriaEntrada.has(cleanAndToStr(row["Chave Unica"])));
    
    const chavesValidasEntrada = notasValidas.map(row => ({
        "Chave de acesso": cleanAndToStr(row["Chave de acesso"]),
        "Tipo": "NFE",
        "Fornecedor": row["Fornecedor"],
        "Emissão": String(row["Emissão"]).substring(0, 10),
        "Total": row['Total'] || 0,
        // Campos para verificação de cadastro
        "destCNPJ": row.destCNPJ,
        "destIE": row.destIE,
        "destUF": row.destUF,
        "emitCNPJ": row.emitCNPJ,
        "emitName": row.emitName,
        "emitIE": row.emitIE,
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
        "Fornecedor": row["Destinatário"], // Usando 'Fornecedor' como campo genérico para simplificar
        "Emissão": String(row["Emissão"]).substring(0, 10),
        "Total": row['Total'] || 0,
    }));

    const chavesValidas = [...chavesValidasEntrada, ...chavesValidasCte, ...chavesValidasSaida];

    log(`- ${chavesValidas.length} chaves válidas para verificação SPED geradas.`);
    
    const finalResult: DataFrames = {
        "Notas Válidas": notasValidas,
        "CTEs Válidos": ctesValidos,
        "Itens Válidos": itensValidos, 
        "Itens Acima de 1200": itensAcimaDe1200,
        "Chaves Válidas": chavesValidas,
        "Saídas": saidasValidas, "Itens Válidos Saídas": itensValidosSaidas,
        "Imobilizados": imobilizados,
        "Emissão Própria": emissaoPropria, "Notas Canceladas": notasCanceladas,
        ...originalDfs 
    };
    
    const addCfopDescriptionToRow = (row: any) => {
        if (!row || typeof row !== 'object') {
            return { ...row, 'Descricao CFOP': 'N/A' };
        }
        if (!row['CFOP']) {
            // Find CFOP in related items if not present in the main row
            const chaveUnica = cleanAndToStr(row['Chave Unica']);
            const relatedItem = itens.find(item => cleanAndToStr(item['Chave Unica']) === chaveUnica && item['CFOP']);
            if (relatedItem) {
                row['CFOP'] = relatedItem['CFOP'];
            } else {
                return { ...row, 'Descricao CFOP': 'N/A' };
            }
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
        "Notas Válidas", "CTEs Válidos", "Itens Válidos", "Itens Acima de 1200", "Chaves Válidas", "Saídas", "Itens Válidos Saídas",
        "Imobilizados",
        "Emissão Própria", "Notas Canceladas", ...Object.keys(originalDfs)
    ];

    displayOrder.forEach(name => {
        let sheetData = finalResult[name];
        if (sheetData && sheetData.length > 0) {
            if (["Itens Válidos", "Emissão Própria", "Itens Válidos Saídas", "Saídas", "Notas Válidas", "Imobilizados", "Itens Acima de 1200"].includes(name)) {
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