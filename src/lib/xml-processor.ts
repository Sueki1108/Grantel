
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
    const infAdic = infNFe.getElementsByTagNameNS(NFE_NAMESPACE, 'infAdic')[0];
    
    const infProt = protNFe?.getElementsByTagNameNS(NFE_NAMESPACE, 'infProt')[0];

    if (!ide || !emit || !dest || !total) {
        log("AVISO: Estrutura do XML NFe incompleta. Faltam tags essenciais como ide, emit, dest, ou total.");
        return null;
    }

    const chaveAcesso = getAttributeValue(infNFe, 'Id').replace('NFe', '');
    const nNF = getTagValue(ide, 'nNF');
    const dhEmiRaw = getTagValue(ide, 'dhEmi');
    
    const emitCNPJ = getTagValue(emit, 'CNPJ');
    const emitNome = getTagValue(emit, 'xNome');
    const emitIE = getTagValue(emit, 'IE'); // Extrair a Inscrição Estadual do Emitente
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
        'infCpl': infCpl,
    };
    
    if (isSaida) {
        notaFiscal['Destinatário'] = destNome;
        notaFiscal['CPF/CNPJ do Destinatário'] = destCNPJ;
        // Adicionar totais de ICMS para saídas
        notaFiscal['Base ICMS'] = parseFloat(vBC) || 0;
        notaFiscal['Valor ICMS'] = parseFloat(vICMS) || 0;
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
        };

        // Extrai todos os campos de <prod>
        for (const child of Array.from(prod.children)) {
            const tagName = child.tagName;
            const content = child.textContent;
            if (tagName && content) {
                item[`prod_${tagName}`] = content;
            }
        }
        
        // Renomeia os campos mais comuns para melhor legibilidade
        item['Código'] = item.prod_cProd;
        item['Descrição'] = item.prod_xProd;
        item['NCM'] = item.prod_NCM;
        item['CFOP'] = item.prod_CFOP;
        item['Unidade'] = item.prod_uCom;
        item['Quantidade'] = parseFloat(item.prod_qCom) || 0;
        item['Valor Unitário'] = parseFloat(item.prod_vUnCom) || 0;
        item['Valor Total'] = parseFloat(item.prod_vProd) || 0;

        // Adiciona explicitamente o CFOP e NCM ao nível principal do item se não estiverem já lá
        if (!item['CFOP']) item['CFOP'] = getTagValue(prod, 'CFOP');
        if (!item['NCM']) item['NCM'] = getTagValue(prod, 'NCM');

        if (imposto) {
            const icmsGroup = imposto.getElementsByTagNameNS(NFE_NAMESPACE, 'ICMS')[0];
            if (icmsGroup) {
                const taxDetails = icmsGroup.children[0]; // ex: ICMS00, ICMS10, etc.
                if (taxDetails) {
                     for (const taxField of Array.from(taxDetails.children)) {
                        const tagName = taxField.tagName;
                        const textContent = taxField.textContent;
                        
                        if (tagName === 'CST' || tagName === 'CSOSN') {
                             item['CST do ICMS'] = textContent;
                        } else if (tagName === 'pICMS') {
                             item['pICMS'] = textContent ? parseFloat(textContent) : 0;
                        }
                    }
                }
            }
        }
        
        // Se for uma nota de saída, pega o CFOP e Alíquota do primeiro item e adiciona ao cabeçalho
        if (isSaida && i === 0) {
            notaFiscal['CFOP'] = item['CFOP'];
            notaFiscal['Alíq. ICMS (%)'] = item['pICMS'] || 0;
        }


        itens.push(item);
    }
    
    if (isSaida) {
        return { nfe: [], itens: [], saidas: [notaFiscal], itensSaidas: itens, cte: [] };
    } else { // 'entrada'
        return { nfe: [notaFiscal], itens: itens, saidas: [], itensSaidas: [], cte: [] };
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
    
    // Tomador pode não existir, então verificamos
    const toma = infCte.getElementsByTagName('toma3')[0] || infCte.getElementsByTagName('toma4')[0];
    let tomadorCnpj = '';
    if(toma) {
        tomadorCnpj = getCteTagValue(toma, 'CNPJ');
    }


    if (!ide || !emit || !rem || !dest || !vPrest) {
        log("AVISO: Estrutura do XML CTe incompleta. Faltam tags filhas de <infCte> como ide, emit, rem, dest, ou vPrest.");
        return null;
    }
    
    const chaveAcesso = getAttributeValue(infCte, 'Id').replace('CTe', '');
    const nCT = getCteTagValue(ide, 'nCT');
    const serie = getCteTagValue(ide, 'serie'); // Extract the series
    const dhEmiRaw = getCteTagValue(ide, 'dhEmi');
    const emitCNPJ = getCteTagValue(emit, 'CNPJ');
    const emitIE = getCteTagValue(emit, 'IE'); // Extrair IE do CTe também
    const vTPrest = getCteTagValue(vPrest, 'vTPrest');
    
    const status = getCteTagValue(infProt, 'cStat') === '100' ? 'Autorizadas' : 'Canceladas';

    const notaCte = {
        'Chave de acesso': chaveAcesso,
        'Número': nCT,
        'Série': serie, // Add series to the extracted data
        'Emissão': dhEmiRaw,
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
        'tomadorCNPJ': tomadorCnpj
    };

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
