// Types
type LogFunction = (message: string) => void;
type XmlDataType = "entrada" | "saida" | "cte" | "desconhecido";

export interface XmlData {
    nfe: any[];
    cte: any[];
    itens: any[];
    saidas: any[];
    itensSaidas: any[];
    canceledKeys: Set<string>;
}

// =================================================================
// XML PARSING HELPERS
// =================================================================

const NFE_NAMESPACE = "http://www.portalfiscal.inf.br/nfe";
const CTE_NAMESPACE = "http://www.portalfiscal.inf.br/cte"; // Namespace for CTe
const GRANTEL_CNPJ = "81732042000119";

const getTagValue = (element: Element | undefined, tagName: string, namespace: string = NFE_NAMESPACE): string => {
    if (!element) return '';
    const tags = element.getElementsByTagNameNS(namespace, tagName);
    return tags[0]?.textContent ?? '';
};

const getCteTagValue = (element: Element | undefined, tagName: string): string => {
    if (!element) return '';
    const tags = element.getElementsByTagName(tagName); // CTe XML often does not use namespace prefixes consistently
    return tags[0]?.textContent ?? '';
};


const getAttributeValue = (element: Element | undefined, attributeName: string): string => {
     if (!element) return '';
     return element.getAttribute(attributeName) ?? '';
};

const cleanAndToStr = (value: any): string => {
    if (value === null || typeof value === 'undefined') return "";
    return String(value).replace(/\D/g, '');
};

const parseNFe = (xmlDoc: XMLDocument, log: LogFunction, uploadType: XmlDataType): Partial<XmlData> => {
    const nfeProc = xmlDoc.getElementsByTagNameNS(NFE_NAMESPACE, 'nfeProc')[0];
    const nfe = nfeProc?.getElementsByTagNameNS(NFE_NAMESPACE, 'NFe')[0];
    const infNFe = nfe?.getElementsByTagNameNS(NFE_NAMESPACE, 'infNFe')[0];
    if (!infNFe) {
        log("AVISO: Tag <infNFe> não encontrada. O XML pode não ser uma NFe válida.");
        return {};
    }

    const ide = infNFe.getElementsByTagNameNS(NFE_NAMESPACE, 'ide')[0];
    const emit = infNFe.getElementsByTagNameNS(NFE_NAMESPACE, 'emit')[0];
    const dest = infNFe.getElementsByTagNameNS(NFE_NAMESPACE, 'dest')[0];
    const total = infNFe.getElementsByTagNameNS(NFE_NAMESPACE, 'total')[0];
    const protNFe = nfeProc.getElementsByTagNameNS(NFE_NAMESPACE, 'protNFe')[0];
    const infProt = protNFe?.getElementsByTagNameNS(NFE_NAMESPACE, 'infProt')[0];

    if (!ide || !emit || !dest || !total) {
        log("AVISO: Estrutura do XML NFe incompleta. Faltam tags essenciais.");
        return {};
    }

    const chaveAcesso = getAttributeValue(infNFe, 'Id').replace('NFe', '');
    const emitCNPJ = getTagValue(emit, 'CNPJ');
    
    // Se o upload foi para "saida", confia nessa classificação.
    const isSaida = uploadType === 'saida';

    const notaFiscal: any = {
        'Chave de acesso': chaveAcesso,
        'Número': getTagValue(ide, 'nNF'),
        'Emissão': getTagValue(ide, 'dhEmi').substring(0, 10),
        'Total': parseFloat(getTagValue(total, 'vNF')) || 0,
        'Status': infProt && getTagValue(infProt, 'cStat') === '100' ? 'Autorizadas' : 'Canceladas',
    };

    if (isSaida) {
        notaFiscal['Destinatário'] = getTagValue(dest, 'xNome');
        notaFiscal['CPF/CNPJ do Destinatário'] = getTagValue(dest, 'CNPJ');
    } else { // entrada ou devolução de cliente
        notaFiscal['Fornecedor'] = getTagValue(emit, 'xNome');
        notaFiscal['CPF/CNPJ do Fornecedor'] = emitCNPJ;
        notaFiscal.emitCNPJ = emitCNPJ;
        notaFiscal.emitName = getTagValue(emit, 'xNome');
        notaFiscal.emitIE = getTagValue(emit, 'IE');
        notaFiscal.destCNPJ = getTagValue(dest, 'CNPJ');
        notaFiscal.destIE = getTagValue(dest, 'IE');
        const enderDest = dest.getElementsByTagNameNS(NFE_NAMESPACE, 'enderDest')[0];
        notaFiscal.destUF = getTagValue(enderDest, 'UF');
        notaFiscal.isDevolucaoCliente = cleanAndToStr(notaFiscal.destCNPJ) === GRANTEL_CNPJ;
    }
    
    const chaveUnica = cleanAndToStr(notaFiscal['Número']) + (isSaida ? cleanAndToStr(notaFiscal['CPF/CNPJ do Destinatário']) : cleanAndToStr(emitCNPJ));
    notaFiscal['Chave Unica'] = chaveUnica;

    const itens: any[] = [];
    const detList = infNFe.getElementsByTagNameNS(NFE_NAMESPACE, 'det');
    for (let i = 0; i < detList.length; i++) {
        const det = detList[i];
        if (!det) continue;
        const prod = det.getElementsByTagNameNS(NFE_NAMESPACE, 'prod')[0];
        if (!prod) continue;
        
        itens.push({
            'Chave Unica': chaveUnica,
            'Item': getAttributeValue(det, 'nItem'),
            'Chave de acesso': chaveAcesso,
            'Número da Nota': notaFiscal['Número'],
            'CPF/CNPJ do Emitente': emitCNPJ,
            'Código': getTagValue(prod, 'cProd'),
            'Descrição': getTagValue(prod, 'xProd'),
            'NCM': getTagValue(prod, 'NCM'),
            'CFOP': getTagValue(prod, 'CFOP'),
            'Unidade': getTagValue(prod, 'uCom'),
            'Quantidade': parseFloat(getTagValue(prod, 'qCom')) || 0,
            'Valor Unitário': parseFloat(getTagValue(prod, 'vUnCom')) || 0,
            'Valor Total': parseFloat(getTagValue(prod, 'vProd')) || 0,
        });
    }
    
    if (isSaida) {
        return { saidas: [notaFiscal], itensSaidas: itens };
    } else {
        return { nfe: [notaFiscal], itens: itens };
    }
};

const parseCTe = (xmlDoc: XMLDocument, log: LogFunction): Partial<XmlData> | null => {
    // CTe XMLs sometimes have inconsistent namespace usage. We'll try to get tags by name directly.
    const cteProc = xmlDoc.getElementsByTagName('cteProc')[0];
    if (!cteProc) {
        log("AVISO: Tag <cteProc> não encontrada. O XML pode não ser um documento de CTe processado.");
        return null;
    }
    
    const infCte = cteProc.getElementsByTagName('infCte')[0];
    const infProt = cteProc.getElementsByTagName('infProt')[0];

    if (!infCte || !infProt) {
        log("AVISO: Estrutura do XML CTe incompleta. Faltam tags essenciais como <infCte> ou <infProt>.");
        return null;
    }

    const ide = infCte.getElementsByTagName('ide')[0];
    const emit = infCte.getElementsByTagName('emit')[0];
    const rem = infCte.getElementsByTagName('rem')[0];
    const dest = infCte.getElementsByTagName('dest')[0];
    const vPrest = infCte.getElementsByTagName('vPrest')[0];

    if (!ide || !emit || !rem || !dest || !vPrest) {
        log("AVISO: Estrutura do XML CTe incompleta. Faltam tags filhas de <infCte> como ide, emit, rem, dest, ou vPrest.");
        return null;
    }
    
    const chaveAcesso = getAttributeValue(infCte, 'Id').replace('CTe', '');
    const nCT = getCteTagValue(ide, 'nCT');
    const serie = getCteTagValue(ide, 'serie'); // Extract the series
    const dhEmiRaw = getCteTagValue(ide, 'dhEmi');
    const dhEmi = dhEmiRaw ? dhEmiRaw.substring(0, 10) : null;
    const emitCNPJ = getCteTagValue(emit, 'CNPJ');
    const emitIE = getCteTagValue(emit, 'IE'); // Extrair IE do CTe também
    const vTPrest = getCteTagValue(vPrest, 'vTPrest');
    
    const status = getCteTagValue(infProt, 'cStat') === '100' ? 'Autorizadas' : 'Canceladas';

    const notaCte = {
        'Chave de acesso': chaveAcesso,
        'Número': nCT,
        'Série': serie, // Add series to the extracted data
        'Emissão': dhEmi,
        'Fornecedor': getCteTagValue(emit, 'xNome'),
        'CPF/CNPJ do Fornecedor': emitCNPJ,
        'emitIE': emitIE, // Adicionar a IE do emitente do CTe
        'Remetente': getCteTagValue(rem, 'xNome'),
        'CPF/CNPJ do Remetente': getCteTagValue(rem, 'CNPJ'),
        'Destinatário': getCteTagValue(dest, 'xNome'),
        'CPF/CNPJ do Destinatário': getCteTagValue(dest, 'CNPJ'),
        'Valor da Prestação': parseFloat(vTPrest) || 0,
        'Status': status,
        'Chave Unica': cleanAndToStr(nCT) + cleanAndToStr(emitCNPJ),
    };

    return { cte: [notaCte] };
};

const parseCancelEvent = (xmlDoc: XMLDocument, log: LogFunction): Partial<XmlData> | null => {
    const eventoList = xmlDoc.getElementsByTagNameNS(NFE_NAMESPACE, 'evento');
    if (eventoList.length === 0 || !eventoList[0]) return null;

    const infEvento = eventoList[0].getElementsByTagNameNS(NFE_NAMESPACE, 'infEvento')[0];
    if (!infEvento) return null;
    
    const tpEvento = getTagValue(infEvento, 'tpEvento');
    const descEvento = getTagValue(infEvento, 'descEvento');

    if (tpEvento === '110111' || descEvento.toLowerCase() === 'cancelamento') {
        const chNFe = getTagValue(infEvento, 'chNFe');
        if (chNFe) {
            log(`INFO: Evento de cancelamento detectado para a chave: ${chNFe}`);
            return { canceledKeys: new Set([chNFe]) };
        }
    }
    return null;
}

const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target && event.target.result instanceof ArrayBuffer) {
                const buffer = event.target.result;
                let decoder = new TextDecoder('utf-8', { fatal: true });
                try {
                    const text = decoder.decode(buffer);
                    if (text.includes('')) throw new Error("UTF-8 with replacement chars");
                    resolve(text);
                } catch(e) {
                    decoder = new TextDecoder('iso-8859-1');
                    resolve(decoder.decode(buffer));
                }
            } else {
                reject(new Error('Falha ao ler o ficheiro como ArrayBuffer.'));
            }
        };
        reader.onerror = () => {
            reject(new Error(`Erro ao ler o ficheiro: ${file.name}`));
        };
        reader.readAsArrayBuffer(file);
    });
};

export const processNfseForPeriodDetection = async (files: File[]): Promise<string[]> => {
    const dates: string[] = [];
    const parser = new DOMParser();

    const findValue = (root: Element, paths: string[]): string | null => {
        for (const path of paths) {
            const foundElement = root.querySelector(path);
            if (foundElement?.textContent) {
                return foundElement.textContent.trim();
            }
        }
        return null;
    }

    for (const file of files) {
        const xmlText = await readFileAsText(file);
        const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
        const root = xmlDoc.documentElement;

        const dateStr = findValue(root, ["data_nfse", "DataEmissao", "dhEmi"]);
        if (dateStr) {
            // Handle different date formats, e.g., DD/MM/YYYY or YYYY-MM-DD
            let date: Date;
            if (dateStr.includes('/')) {
                const parts = dateStr.split(' ')[0].split('/');
                if(parts.length === 3) {
                    date = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
                } else {
                    date = new Date('invalid');
                }
            } else {
                date = new Date(dateStr);
            }

            if (!isNaN(date.getTime())) {
                dates.push(date.toISOString());
            }
        }
    }
    return dates;
};


// =================================================================
// MAIN PROCESSING FUNCTION
// =================================================================

export const processUploadedXmls = async (files: File[], log: LogFunction, uploadType: XmlDataType): Promise<XmlData> => {
    const combinedData: XmlData = {
        nfe: [], cte: [], itens: [], saidas: [], itensSaidas: [], canceledKeys: new Set()
    };

    if (files.length === 0) {
        return combinedData;
    }

    log(`Processando ${files.length} ficheiros XML como '${uploadType}'.`);
    const parser = new DOMParser();

    for (const file of files) {
        try {
            const fileContent = await readFileAsText(file);
            const xmlDoc = parser.parseFromString(fileContent, "application/xml");
            
            const errorNode = xmlDoc.querySelector('parsererror');
            if (errorNode) {
                log(`AVISO: Falha ao parsear o ficheiro ${file.name}. Não é um XML válido.`);
                continue;
            }

            let parsedResult: Partial<XmlData> | null = null;
            
            if (xmlDoc.getElementsByTagNameNS(NFE_NAMESPACE, 'procEventoNFe').length > 0 || xmlDoc.getElementsByTagName('procEventoCTe').length > 0) {
                parsedResult = parseCancelEvent(xmlDoc, log);
            } else if (xmlDoc.getElementsByTagNameNS(NFE_NAMESPACE, 'nfeProc').length > 0) {
                parsedResult = parseNFe(xmlDoc, log, uploadType);
            } else if (xmlDoc.getElementsByTagName('cteProc').length > 0) {
                parsedResult = parseCTe(xmlDoc, log);
            } else {
                log(`AVISO: Ficheiro ${file.name} não parece ser NFe, CTe ou Evento padrão. Será ignorado.`);
            }
            
            if(parsedResult) {
                if(parsedResult.nfe) combinedData.nfe.push(...parsedResult.nfe);
                if(parsedResult.cte) combinedData.cte.push(...parsedResult.cte);
                if(parsedResult.itens) combinedData.itens.push(...parsedResult.itens);
                if(parsedResult.saidas) combinedData.saidas.push(...parsedResult.saidas);
                if(parsedResult.itensSaidas) combinedData.itensSaidas.push(...parsedResult.itensSaidas);
                if(parsedResult.canceledKeys) {
                    parsedResult.canceledKeys.forEach(key => combinedData.canceledKeys.add(key));
                }
            }

        } catch (error: any) {
            log(`ERRO ao processar o ficheiro ${file.name}: ${error.message}`);
        }
    }
    
    return combinedData;
};

    