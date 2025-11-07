"use client";

// Types
type LogFunction = (message: string) => void;

export interface XmlData {
    nfe: any[];
    cte: any[];
    itens: any[];
    saidas: any[];
    itensSaidas: any[];
    canceledKeys: Set<string>;
}

const EMPTY_XML_DATA: XmlData = {
    nfe: [],
    cte: [],
    itens: [],
    saidas: [],
    itensSaidas: [],
    canceledKeys: new Set(),
};


// =================================================================
// XML PARSING HELPERS
// =================================================================

const NFE_NAMESPACE = "http://www.portalfiscal.inf.br/nfe";
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

const parseNFe = (xmlDoc: XMLDocument, log: LogFunction): Partial<XmlData> | null => {
    const nfeProcList = xmlDoc.getElementsByTagNameNS(NFE_NAMESPACE, 'nfeProc');
    if (nfeProcList.length === 0 || !nfeProcList[0]) {
        log("AVISO: Tag <nfeProc> não encontrada. O XML pode não ser um documento de NFe processado.");
        return null;
    }
    const nfeProc = nfeProcList[0];
    
    const nfeList = nfeProc.getElementsByTagNameNS(NFE_NAMESPACE, 'NFe');
    if (nfeList.length === 0 || !nfeList[0]) {
        log("AVISO: Tag <NFe> não encontrada no nfeProc.");
        return null;
    }
    const nfe = nfeList[0];
    
    const infNFeList = nfe.getElementsByTagNameNS(NFE_NAMESPACE, 'infNFe');
    if (infNFeList.length === 0 || !infNFeList[0]) {
        log("AVISO: Tag <infNFe> não encontrada na NFe.");
        return null;
    }
    const infNFe = infNFeList[0];

    const ide = infNFe.getElementsByTagNameNS(NFE_NAMESPACE, 'ide')[0];
    const emit = infNFe.getElementsByTagNameNS(NFE_NAMESPACE, 'emit')[0];
    const dest = infNFe.getElementsByTagNameNS(NFE_NAMESPACE, 'dest')[0];
    const total = infNFe.getElementsByTagNameNS(NFE_NAMESPACE, 'total')[0];
    const detList = infNFe.getElementsByTagNameNS(NFE_NAMESPACE, 'det');
    const protNFe = nfeProc.getElementsByTagNameNS(NFE_NAMESPACE, 'protNFe')[0];
    const infCpl = getTagValue(infNFe, 'infCpl');
    
    const infProt = protNFe?.getElementsByTagNameNS(NFE_NAMESPACE, 'infProt')[0];

    if (!ide || !emit || !dest || !total) {
        log("AVISO: Estrutura do XML NFe incompleta. Faltam tags essenciais como ide, emit, dest, ou total.");
        return null;
    }

    const chaveAcesso = getAttributeValue(infNFe, 'Id').replace('NFe', '');
    const nNF = getTagValue(ide, 'nNF');
    const dhEmiRaw = getTagValue(ide, 'dhEmi');
    const dhEmi = dhEmiRaw ? dhEmiRaw.substring(0, 10) : null;


    const emitCNPJ = getTagValue(emit, 'CNPJ');
    const emitNome = getTagValue(emit, 'xNome');
    const emitIE = getTagValue(emit, 'IE'); // Extrair a Inscrição Estadual do Emitente
    const destCNPJ = getTagValue(dest, 'CNPJ');
    const destNome = getTagValue(dest, 'xNome');
    const destIE = getTagValue(dest, 'IE');
    const enderDest = dest.getElementsByTagNameNS(NFE_NAMESPACE, 'enderDest')[0];
    const destUF = getTagValue(enderDest, 'UF');


    const vNF = getTagValue(total, 'vNF');
    
    let status = 'Autorizadas';
    if(infProt) {
        status = getTagValue(infProt, 'cStat') === '100' ? 'Autorizadas' : 'Canceladas';
    }


    const isSaida = cleanAndToStr(emitCNPJ) === GRANTEL_CNPJ;

    let notaFiscal: any = {
        'Chave de acesso': chaveAcesso,
        'Número': nNF,
        'Emissão': dhEmi,
        'Total': parseFloat(vNF) || 0,
        'Status': status,
        'finNFe': getTagValue(ide, 'finNFe'), // Adicionando finNFe
        'infCpl': infCpl,
    };
    
    if (isSaida) {
        notaFiscal['Destinatário'] = destNome;
        notaFiscal['CPF/CNPJ do Destinatário'] = destCNPJ;
    } else { // entrada
        notaFiscal['Fornecedor'] = emitNome;
        notaFiscal['CPF/CNPJ do Fornecedor'] = emitCNPJ;
        notaFiscal['emitCNPJ'] = emitCNPJ;
        notaFiscal['emitName'] = emitNome;
        notaFiscal['emitIE'] = emitIE; // Adicionar a IE do emitente aos dados da nota
        notaFiscal['destCNPJ'] = destCNPJ;
        notaFiscal['destIE'] = destIE;
        notaFiscal['destUF'] = destUF;
    }
    
    const chaveUnica = cleanAndToStr(nNF) + (isSaida ? cleanAndToStr(destCNPJ) : cleanAndToStr(emitCNPJ));
    notaFiscal['Chave Unica'] = chaveUnica;

    const itens: any[] = [];
    for (let i = 0; i < detList.length; i++) {
        const det = detList[i];
        if (!det) continue;
        const prod = det.getElementsByTagNameNS(NFE_NAMESPACE, 'prod')[0];
        const imposto = det.getElementsByTagNameNS(NFE_NAMESPACE, 'imposto')[0];
        if (!prod) continue;
        
        let item: any = {
            'Chave Unica': chaveUnica,
            'Item': getAttributeValue(det, 'nItem'),
            'Chave de acesso': chaveAcesso,
            'Número da Nota': nNF,
            'CPF/CNPJ do Emitente': emitCNPJ,
            'Código': getTagValue(prod, 'cProd'),
            'Descrição': getTagValue(prod, 'xProd'),
            'NCM': getTagValue(prod, 'NCM'),
            'CFOP': getTagValue(prod, 'CFOP'),
            'Unidade': getTagValue(prod, 'uCom'),
            'Quantidade': parseFloat(getTagValue(prod, 'qCom')) || 0,
            'Valor Unitário': parseFloat(getTagValue(prod, 'vUnCom')) || 0,
            'Valor Total': parseFloat(getTagValue(prod, 'vProd')) || 0,
        };

        if (imposto) {
            const icmsGroup = imposto.getElementsByTagNameNS(NFE_NAMESPACE, 'ICMS')[0];
            if (icmsGroup && icmsGroup.firstElementChild) {
                const cstTag = icmsGroup.firstElementChild.getElementsByTagNameNS(NFE_NAMESPACE, 'CST')[0];
                if (cstTag && cstTag.textContent) {
                    item['CST do ICMS'] = cstTag.textContent;
                } else {
                    const csosnTag = icmsGroup.firstElementChild.getElementsByTagNameNS(NFE_NAMESPACE, 'CSOSN')[0];
                    if (csosnTag && csosnTag.textContent) {
                         item['CST do ICMS'] = csosnTag.textContent;
                    }
                }
            }
        }

        itens.push(item);
    }
    
    if (isSaida) {
        return { saidas: [notaFiscal], itensSaidas: itens };
    } else {
        return { nfe: [notaFiscal], itens: itens };
    }
};

const parseCTe = (xmlDoc: XMLDocument, log: LogFunction): Partial<XmlData> | null => {
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
    const toma = infCte.getElementsByTagName('toma04')[0] || infCte.getElementsByTagName('toma4')[0] || infCte.getElementsByTagName('toma')[0]; // Tomador
    const vPrest = infCte.getElementsByTagName('vPrest')[0];

    if (!ide || !emit || !rem || !dest || !vPrest) {
        log("AVISO: Estrutura do XML CTe incompleta. Faltam tags filhas de <infCte> como ide, emit, rem, dest, ou vPrest.");
        return null;
    }
    
    const chaveAcesso = getAttributeValue(infCte, 'Id').replace('CTe', '');
    const nCT = getCteTagValue(ide, 'nCT');
    const serie = getCteTagValue(ide, 'serie');
    const dhEmiRaw = getCteTagValue(ide, 'dhEmi');
    const dhEmi = dhEmiRaw ? dhEmiRaw.substring(0, 10) : null;
    const emitCNPJ = getCteTagValue(emit, 'CNPJ');
    const emitIE = getCteTagValue(emit, 'IE');
    const vTPrest = getCteTagValue(vPrest, 'vTPrest');
    
    const status = getCteTagValue(infProt, 'cStat') === '100' ? 'Autorizadas' : 'Canceladas';

    let tomadorCnpj = '';
    if (toma) {
        tomadorCnpj = getCteTagValue(toma, 'CNPJ');
    }
    if (!tomadorCnpj) {
        // Fallback para o destinatário se o tomador não for encontrado
        tomadorCnpj = getCteTagValue(dest, 'CNPJ');
    }

    const notaCte = {
        'Chave de acesso': chaveAcesso,
        'Número': nCT,
        'Série': serie,
        'Emissão': dhEmi,
        'Fornecedor': getCteTagValue(emit, 'xNome'),
        'CPF/CNPJ do Fornecedor': emitCNPJ,
        'emitIE': emitIE,
        'Remetente': getCteTagValue(rem, 'xNome'),
        'CPF/CNPJ do Remetente': getCteTagValue(rem, 'CNPJ'),
        'Destinatário': getCteTagValue(dest, 'xNome'),
        'CPF/CNPJ do Destinatário': getCteTagValue(dest, 'CNPJ'),
        'tomadorCNPJ': tomadorCnpj, // Adicionando CNPJ do tomador
        'Valor da Prestação': parseFloat(vTPrest) || 0,
        'Status': status,
        'Chave Unica': cleanAndToStr(nCT) + cleanAndToStr(emitCNPJ),
    };

    return { cte: [notaCte] };
};

const parseEvent = (xmlDoc: XMLDocument, log: LogFunction): Partial<XmlData> | null => {
    const eventoList = xmlDoc.getElementsByTagNameNS(NFE_NAMESPACE, 'evento');
    if (eventoList.length === 0 || !eventoList[0]) return null;

    const infEvento = eventoList[0].getElementsByTagNameNS(NFE_NAMESPACE, 'infEvento')[0];
    if (!infEvento) return null;
    
    const tpEvento = getTagValue(infEvento, 'tpEvento');
    
    // Evento de Cancelamento: 110111
    if (tpEvento === '110111') {
        const chNFe = getTagValue(infEvento, 'chNFe');
        if (chNFe) {
            log(`INFO: Evento de cancelamento detectado para a chave: ${chNFe}`);
            return { canceledKeys: new Set([chNFe]) };
        }
    }
    
    // Outros eventos, como Carta de Correção (110110), são ignorados e não invalidam a nota.
    // O retorno nulo garante que a chave não seja adicionada ao conjunto de canceladas.
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

export const processUploadedXmls = async (files: File[]): Promise<XmlData> => {
    const combinedData: XmlData = {
        nfe: [], cte: [], itens: [], saidas: [], itensSaidas: [], canceledKeys: new Set()
    };

    if (files.length === 0) {
        return combinedData;
    }

    const parser = new DOMParser();

    for (const file of files) {
        try {
            const fileContent = await readFileAsText(file);
            const xmlDoc = parser.parseFromString(fileContent, "application/xml");
            
            const errorNode = xmlDoc.querySelector('parsererror');
            if (errorNode) {
                // Not logging parse errors as it's too verbose for the user
                continue;
            }

            let parsedResult: Partial<XmlData> | null = null;
            
            if (xmlDoc.getElementsByTagNameNS(NFE_NAMESPACE, 'procEventoNFe').length > 0 || xmlDoc.getElementsByTagName('procEventoCTe').length > 0) {
                // This is an event XML (like cancellation or correction letter)
                parsedResult = parseEvent(xmlDoc, () => {});
            } else if (xmlDoc.getElementsByTagNameNS(NFE_NAMESPACE, 'nfeProc').length > 0) {
                // This is a standard NFe
                parsedResult = parseNFe(xmlDoc, () => {});
            } else if (xmlDoc.getElementsByTagName('cteProc').length > 0) {
                // This is a standard CTe
                parsedResult = parseCTe(xmlDoc, () => {});
            }
            
            if(parsedResult) {
                // Merge results into combinedData
                combinedData.nfe.push(...(parsedResult.nfe || []));
                combinedData.cte.push(...(parsedResult.cte || []));
                combinedData.itens.push(...(parsedResult.itens || []));
                combinedData.saidas.push(...(parsedResult.saidas || []));
                combinedData.itensSaidas.push(...(parsedResult.itensSaidas || []));
                if (parsedResult.canceledKeys) {
                    parsedResult.canceledKeys.forEach(key => combinedData.canceledKeys.add(key));
                }
            }

        } catch (error: any) {
            console.error(`ERRO ao processar o ficheiro ${file.name}: ${error.message}`);
        }
    }
    
    return combinedData;
};
