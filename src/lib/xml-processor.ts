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

const getTagValueWithoutNamespace = (element: Element | undefined, tagName: string): string => {
    if (!element) return '';
    const tags = element.getElementsByTagName(tagName);
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
    const entrega = infNFe.getElementsByTagNameNS(NFE_NAMESPACE, 'entrega')[0];
    const total = infNFe.getElementsByTagNameNS(NFE_NAMESPACE, 'total')[0];
    const detList = infNFe.getElementsByTagNameNS(NFE_NAMESPACE, 'det');
    const protNFe = nfeProc.getElementsByTagNameNS(NFE_NAMESPACE, 'protNFe')[0];
    const infAdic = infNFe.getElementsByTagNameNS(NFE_NAMESPACE, 'infAdic')[0];
    
    const infProt = protNFe?.getElementsByTagNameNS(NFE_NAMESPACE, 'infProt')[0];

    if (!ide || !emit || !dest || !total) {
        log("AVISO: Estrutura do XML NFe incompleta. Faltam tags essenciais como ide, emit, dest, ou total.");
        return null;
    }

    const chaveAcesso = getAttributeValue(infNFe, 'Id').replace('NFe', '');
    const nNF = getTagValue(ide, 'nNF');
    const natOp = getTagValue(ide, 'natOp');
    const dhEmiRaw = getTagValue(ide, 'dhEmi');
    const refNFe = getTagValue(ide, 'refNFe');
    
    const emitCNPJ = getTagValue(emit, 'CNPJ');
    const emitNome = getTagValue(emit, 'xNome');
    const emitIE = getTagValue(emit, 'IE');
    const destCNPJ = getTagValue(dest, 'CNPJ');
    const destNome = getTagValue(dest, 'xNome');
    const destIE = getTagValue(dest, 'IE');
    const enderDest = dest.getElementsByTagNameNS(NFE_NAMESPACE, 'enderDest')[0];
    const destUF = getTagValue(enderDest, 'UF');
    const infCpl = getTagValue(infAdic, 'infCpl');


    // Extract ICMS Totals
    const icmsTot = total.getElementsByTagNameNS(NFE_NAMESPACE, 'ICMSTot')[0];
    const vBC = getTagValue(icmsTot, 'vBC');
    const vICMS = getTagValue(icmsTot, 'vICMS');


    const vNF = getTagValue(total, 'vNF');
    
    let status = 'Autorizadas';
    if(infProt) {
        status = getTagValue(infProt, 'cStat') === '100' ? 'Autorizadas' : 'Canceladas';
    }


    const isSaida = cleanAndToStr(emitCNPJ) === GRANTEL_CNPJ;

    let notaFiscal: any = {
        'Chave de acesso': chaveAcesso,
        'Número': nNF,
        'Emissão': dhEmiRaw,
        'Total': parseFloat(vNF) || 0,
        'Status': status,
        'Natureza da Operação': natOp,
        'infCpl': infCpl,
        'destUF': destUF,
        'entrega_UF': entrega ? getTagValueWithoutNamespace(entrega, 'UF') : destUF,
        'entrega_Mun': entrega ? getTagValueWithoutNamespace(entrega, 'xMun') : getTagValue(enderDest, 'xMun'),
        'refNFe': refNFe,
    };
    
    // Universal key generation based on emitter
    const chaveUnica = `${cleanAndToStr(nNF)}-${cleanAndToStr(emitCNPJ)}`;
    notaFiscal['Chave Unica'] = chaveUnica;

    if (isSaida) {
        notaFiscal['Destinatário'] = destNome;
        notaFiscal['CPF/CNPJ do Destinatário'] = destCNPJ;
        notaFiscal['Base ICMS'] = parseFloat(vBC) || 0;
        notaFiscal['Valor ICMS'] = parseFloat(vICMS) || 0;
    } else { // entrada
        notaFiscal['Fornecedor'] = emitNome;
        notaFiscal['CPF/CNPJ do Fornecedor'] = emitCNPJ;
        notaFiscal['CPF/CNPJ do Destinatário'] = destCNPJ;
        notaFiscal['emitCNPJ'] = emitCNPJ;
        notaFiscal['emitName'] = emitNome;
        notaFiscal['emitIE'] = emitIE;
        notaFiscal['destCNPJ'] = destCNPJ;
        notaFiscal['destIE'] = destIE;
    }
    
    const itens: any[] = [];
    for (let i = 0; i < detList.length; i++) {
        const det = detList[i];
        if (!det) continue;
        const prod = det.getElementsByTagNameNS(NFE_NAMESPACE, 'prod')[0];
        const imposto = det.getElementsByTagNameNS(NFE_NAMESPACE, 'imposto')[0];
        if (!prod) continue;
        
        let item: any = {
            'Chave Unica': chaveUnica, // Use the consistent key
            'Item': getAttributeValue(det, 'nItem'),
            'Chave de acesso': chaveAcesso,
            'Número da Nota': nNF,
            'CPF/CNPJ do Emitente': emitCNPJ, // Always include emitter CNPJ
            'Código': getTagValue(prod, 'cProd'),
            'Descrição': getTagValue(prod, 'xProd'),
            'NCM': getTagValue(prod, 'NCM') || null,
            'CFOP': getTagValue(prod, 'CFOP'),
            'CEST': getTagValue(prod, 'CEST') || null,
            'Unidade': getTagValue(prod, 'uCom'),
            'Quantidade': parseFloat(getTagValue(prod, 'qCom')) || 0,
            'Valor Unitário': parseFloat(getTagValue(prod, 'vUnCom')) || 0,
            'Valor Total': parseFloat(getTagValue(prod, 'vProd')) || 0,
            'Alíq. ICMS (%)': null,
            'CST do ICMS': null,
        };

        if (imposto) {
            const icmsGroup = imposto.getElementsByTagNameNS(NFE_NAMESPACE, 'ICMS')[0];
            if (icmsGroup) {
                const taxDetails = icmsGroup.children[0]; 
                if (taxDetails) {
                     for (const taxField of Array.from(taxDetails.children)) {
                        const tagName = taxField.tagName;
                        const textContent = taxField.textContent;
                        
                        if (tagName === 'CST' || tagName === 'CSOSN') {
                             item['CST do ICMS'] = textContent;
                        } else if (tagName === 'pICMS') {
                             item['Alíq. ICMS (%)'] = textContent ? parseFloat(textContent) : null;
                        }
                    }
                }
            }
        }

        if (isSaida && i === 0) {
            notaFiscal['CFOP'] = item['CFOP'];
            notaFiscal['Alíq. ICMS (%)'] = item['Alíq. ICMS (%)'] ?? 0;
        }

        itens.push(item);
    }
    
    if (isSaida) {
        return { nfe: [], itens: [], saidas: [notaFiscal], itensSaidas: itens, cte: [] };
    } else {
        return { nfe: [notaFiscal], itens: itens, saidas: [], itensSaidas: [], cte: [] };
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
    const receb = infCte.getElementsByTagName('receb')[0]; // Adicionado Recebedor
    const vPrest = infCte.getElementsByTagName('vPrest')[0];
    
    const toma = infCte.getElementsByTagName('toma3')[0] || infCte.getElementsByTagName('toma4')[0];
    let tomadorCnpj = '';
    if(toma) {
        tomadorCnpj = getTagValueWithoutNamespace(toma, 'CNPJ');
    }


    if (!ide || !emit || !rem || !dest || !vPrest) {
        log("AVISO: Estrutura do XML CTe incompleta. Faltam tags filhas de <infCte> como ide, emit, rem, dest, ou vPrest.");
        return null;
    }
    
    const chaveAcesso = getAttributeValue(infCte, 'Id').replace('CTe', '');
    const nCT = getTagValueWithoutNamespace(ide, 'nCT');
    const serie = getTagValueWithoutNamespace(ide, 'serie');
    const dhEmiRaw = getTagValueWithoutNamespace(ide, 'dhEmi');
    const emitCNPJ = getTagValueWithoutNamespace(emit, 'CNPJ');
    const emitIE = getTagValueWithoutNamespace(emit, 'IE');
    const vTPrest = getTagValueWithoutNamespace(vPrest, 'vTPrest');
    
    const status = getTagValueWithoutNamespace(infProt, 'cStat') === '100' ? 'Autorizadas' : 'Canceladas';

    const notaCte: any = {
        'Chave de acesso': chaveAcesso,
        'Número': nCT,
        'Série': serie,
        'Emissão': dhEmiRaw,
        'Fornecedor': getTagValueWithoutNamespace(emit, 'xNome'),
        'CPF/CNPJ do Fornecedor': emitCNPJ,
        'emitCNPJ': emitCNPJ,
        'emitIE': emitIE,
        'Remetente': getTagValueWithoutNamespace(rem, 'xNome'),
        'CPF/CNPJ do Remetente': getTagValueWithoutNamespace(rem, 'CNPJ'),
        'Destinatário': getTagValueWithoutNamespace(dest, 'xNome'),
        'CPF/CNPJ do Destinatário': getTagValueWithoutNamespace(dest, 'CNPJ') || getTagValueWithoutNamespace(dest, 'CPF'),
        'Valor da Prestação': parseFloat(vTPrest) || 0,
        'Status': status,
        'Chave Unica': `${cleanAndToStr(nCT)}-${cleanAndToStr(emitCNPJ)}`,
        'tomadorCNPJ': tomadorCnpj,
        'destUF': getTagValueWithoutNamespace(ide, 'UFFim') // Add destination UF for CTE
    };
    
    if (receb) {
        notaCte.recebCNPJ = getTagValueWithoutNamespace(receb, 'CNPJ');
        notaCte.recebIE = getTagValueWithoutNamespace(receb, 'IE');
        const enderReceb = receb.getElementsByTagName('enderReceb')[0];
        if (enderReceb) {
            notaCte.recebUF = getTagValueWithoutNamespace(enderReceb, 'UF');
        }
    }


    return { cte: [notaCte], nfe: [], itens: [], saidas: [], itensSaidas: [] };
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
                try {
                    // Try UTF-8 first.
                    const decoder = new TextDecoder('utf-8', { fatal: true });
                    const text = decoder.decode(buffer);
                    if (text.includes('\uFFFD')) { // Check for the Unicode Replacement Character
                        throw new Error("UTF-8 decoding resulted in replacement characters.");
                    }
                    resolve(text);
                } catch (e) {
                    try {
                        // Fallback to ISO-8859-1 if UTF-8 fails
                        const decoder = new TextDecoder('iso-8859-1');
                        resolve(decoder.decode(buffer));
                    } catch (e2) {
                        reject(new Error(`Falha ao descodificar o ficheiro ${file.name} com UTF-8 e ISO-8859-1.`));
                    }
                }
            } else {
                reject(new Error('Falha ao ler o ficheiro como ArrayBuffer.'));
            }
        };
        reader.onerror = () => reject(new Error(`Erro ao ler o ficheiro: ${file.name}`));
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
        try {
            const xmlText = await readFileAsText(file);
            const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
            const root = xmlDoc.documentElement;
            
            if (root.querySelector('parsererror')) continue;

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
        } catch (e) {
            // Ignore files that fail to parse during period detection
        }
    }
    return dates;
};


// =================================================================
// MAIN PROCESSING FUNCTION
// =================================================================

export const processUploadedXmls = async (files: File[], log: LogFunction = () => {}): Promise<XmlData> => {
    const combinedData: XmlData = {
        nfe: [], cte: [], itens: [], saidas: [], itensSaidas: [], canceledKeys: new Set()
    };

    if (files.length === 0) {
        return combinedData;
    }

    log(`Processando ${files.length} arquivos XML.`);
    const parser = new DOMParser();

    for (const file of files) {
        try {
            const fileContent = await readFileAsText(file);
            const xmlDoc = parser.parseFromString(fileContent, "application/xml");
            
            const errorNode = xmlDoc.querySelector('parsererror');
            if (errorNode) {
                log(`AVISO: Falha ao parsear o arquivo ${file.name}. Não é um XML válido.`);
                continue;
            }

            let parsedResult: Partial<XmlData> | null = null;
            
            if (xmlDoc.getElementsByTagNameNS(NFE_NAMESPACE, 'procEventoNFe').length > 0 || xmlDoc.getElementsByTagName('procEventoCTe').length > 0) {
                parsedResult = parseCancelEvent(xmlDoc, log);
            } else if (xmlDoc.getElementsByTagNameNS(NFE_NAMESPACE, 'nfeProc').length > 0) {
                parsedResult = parseNFe(xmlDoc, log);
            } else if (xmlDoc.getElementsByTagName('cteProc').length > 0) {
                parsedResult = parseCTe(xmlDoc, log);
            } else {
                log(`AVISO: Arquivo ${file.name} não parece ser NFe, CTe ou Evento padrão. Será ignorado nesta função.`);
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
            log(`ERRO ao processar o arquivo ${file.name}: ${error.message}`);
        }
    }
    
    return combinedData;
};
