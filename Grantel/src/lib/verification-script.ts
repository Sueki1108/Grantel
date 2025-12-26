/**
 * @file Este ficheiro contém um "script" de verificação que detalha a lógica para comparar
 * os dados de um ficheiro XML de NF-e com o texto extraído de uma guia GNRE em formato PDF.
 * O objetivo é fornecer um roteiro claro e reutilizável para uma futura automação.
 */

// ===============================================================
// Tipos de Dados de Entrada
// ===============================================================

/**
 * Representa os dados essenciais extraídos de um ficheiro XML de NF-e.
 */
interface XmlData {
    chaveAcesso: string;
    numeroNota: string;
    valorTotalNota: number;
    emitenteCnpj: string;
    destinatarioCnpj: string;
    municipioDestino: string;
    ufDestino: string;
}

// ===============================================================
// Tipos de Dados de Saída
// ===============================================================

/**
 * Representa o resultado de uma única verificação.
 */
interface VerificationResult {
    passou: boolean;
    esperado: string | number;
    encontrado: string | number;
    mensagem: string;
}

/**
 * O objeto de relatório final, contendo o resultado de todas as verifições.
 */
interface FullReport {
    resumo: {
        totalVerificacoes: number;
        aprovadas: number;
        reprovadas: number;
        statusFinal: 'APROVADO' | 'REPROVADO';
    };
    detalhes: {
        verificacaoVencimento: VerificationResult;
        verificacaoUfFavorecida: VerificationResult;
        verificacaoCodigoReceita: VerificationResult;
        verificacaoValorGuia: VerificationResult;
        verificacaoChaveAcesso: VerificationResult;
        verificacaoCnpjs: VerificationResult;
        verificacaoMunicipio: VerificationResult;
    };
}


// ===============================================================
// Funções Auxiliares de Extração (Simulação de Leitura de PDF)
// ===============================================================

/**
 * Procura um valor no texto da guia usando uma expressão regular.
 * @param textoGuia O conteúdo de texto completo da guia.
 * @param regex A expressão regular para encontrar o valor.
 * @param grupoDeCaptura O índice do grupo de captura que contém o valor.
 * @returns O valor encontrado ou null.
 */
function extrairValor(textoGuia: string, regex: RegExp, grupoDeCaptura: number = 1): string | null {
    const match = textoGuia.match(regex);
    return match && match[grupoDeCaptura] ? match[grupoDeCaptura].trim() : null;
}

/**
 * Limpa e normaliza uma string, removendo caracteres não numéricos.
 * @param valor A string a ser limpa.
 * @returns A string contendo apenas dígitos.
 */
function limparNumeros(valor: string | null | undefined): string {
    if (!valor) return "";
    return valor.replace(/\D/g, '');
}


// ===============================================================
// SCRIPT DE VERIFICAÇÃO PRINCIPAL
// ===============================================================

/**
 * Executa a verificação completa de uma guia GNRE contra os dados do XML correspondente.
 *
 * @param xmlData Os dados extraídos do ficheiro XML.
 * @param textoGuiaPdf O conteúdo de texto completo extraído do ficheiro PDF da guia.
 * @param dataVencimentoEsperada A data de vencimento que a guia deve ter, no formato "DD/MM/AAAA".
 *
 * @returns Um objeto de relatório detalhado com o resultado de cada verificação.
 */
export function verifyGnreAgainstXml(
    xmlData: XmlData,
    textoGuiaPdf: string,
    dataVencimentoEsperada: string
): FullReport {

    const resultados: any = {};

    // --- 1. Verificação da Data de Vencimento e "Documento Válido" ---
    const dataVencimentoEncontrada = extrairValor(textoGuiaPdf, /VENCIMENTO\s*(\d{2}\/\d{2}\/\d{4})/i);
    resultados.verificacaoVencimento = {
        passou: dataVencimentoEncontrada === dataVencimentoEsperada,
        esperado: dataVencimentoEsperada,
        encontrado: dataVencimentoEncontrada || 'Não encontrado',
        mensagem: 'A data de vencimento deve corresponder à data informada.'
    };
    // Assumimos que "Documento Válido" é a mesma data do vencimento.

    // --- 2. Verificação da UF Favorecida ---
    const ufFavorecidaEncontrada = extrairValor(textoGuiaPdf, /UF\s+FAVORECIDA\s*([A-Z]{2})/i);
    resultados.verificacaoUfFavorecida = {
        passou: ufFavorecidaEncontrada === 'MS',
        esperado: 'MS',
        encontrado: ufFavorecidaEncontrada || 'Não encontrada',
        mensagem: 'A UF Favorecida deve ser MS (Mato Grosso do Sul).'
    };

    // --- 3. Verificação do Código da Receita ---
    const codReceitaEncontrado = extrairValor(textoGuiaPdf, /CÓDIGO\s+DA\s+RECEITA\s*(\d+)/i);
    resultados.verificacaoCodigoReceita = {
        passou: codReceitaEncontrado === '100102',
        esperado: '100102',
        encontrado: codReceitaEncontrado || 'Não encontrado',
        mensagem: 'O código da receita para DIFAL é 100102.'
    };

    // --- 4. Verificação do Valor da Guia (10% da Nota) ---
    const valorGuiaEsperado = parseFloat((xmlData.valorTotalNota * 0.1).toFixed(2));
    const valorGuiaEncontradoStr = extrairValor(textoGuiaPdf, /VALOR\s+TOTAL\s*([\d,.]+)/i);
    const valorGuiaEncontradoNum = valorGuiaEncontradoStr ? parseFloat(valorGuiaEncontradoStr.replace('.', '').replace(',', '.')) : 0;
    resultados.verificacaoValorGuia = {
        passou: Math.abs(valorGuiaEncontradoNum - valorGuiaEsperado) < 0.01,
        esperado: valorGuiaEsperado,
        encontrado: valorGuiaEncontradoNum,
        mensagem: 'O valor da guia deve ser 10% do valor total da nota fiscal.'
    };

    // --- 5. Verificação da Chave de Acesso ---
    const chaveAcessoEncontrada = limparNumeros(extrairValor(textoGuiaPdf, /CHAVE\s+DE\s+ACESSO\s*([\d\s]+)/i));
    resultados.verificacaoChaveAcesso = {
        passou: chaveAcessoEncontrada === limparNumeros(xmlData.chaveAcesso),
        esperado: limparNumeros(xmlData.chaveAcesso),
        encontrado: chaveAcessoEncontrada || 'Não encontrada',
        mensagem: 'A chave de acesso na guia deve ser a mesma do XML.'
    };

    // --- 6. Verificação dos CNPJs (Emitente e Destinatário) ---
    const cnpjEmitenteEncontrado = limparNumeros(extrairValor(textoGuiaPdf, /EMITENTE\s*([\d.\/-]+)/i));
    const cnpjDestinatarioEncontrado = limparNumeros(extrairValor(textoGuiaPdf, /DESTINATÁRIO\s*([\d.\/-]+)/i));
    resultados.verificacaoCnpjs = {
        passou: cnpjEmitenteEncontrado === limparNumeros(xmlData.emitenteCnpj) && cnpjDestinatarioEncontrado === limparNumeros(xmlData.destinatarioCnpj),
        esperado: `Emit: ${xmlData.emitenteCnpj}, Dest: ${xmlData.destinatarioCnpj}`,
        encontrado: `Emit: ${cnpjEmitenteEncontrado || 'N/A'}, Dest: ${cnpjDestinatarioEncontrado || 'N/A'}`,
        mensagem: 'Os CNPJs do emitente e destinatário na guia devem corresponder aos do XML.'
    };

    // --- 7. Verificação do Município de Destino ---
    const municipioEncontrado = extrairValor(textoGuiaPdf, /MUNICÍPIO\s*DE\s*DESTINO\s*([A-Z\s]+)/i, 1)?.toUpperCase();
    resultados.verificacaoMunicipio = {
        passou: municipioEncontrado === 'SELVIRIA',
        esperado: 'SELVIRIA',
        encontrado: municipioEncontrado || 'Não encontrado',
        mensagem: 'O município de destino deve ser Selvíria.'
    };

    // --- Compilação do Relatório Final ---
    const aprovadas = Object.values(resultados).filter(res => (res as VerificationResult).passou).length;
    const totalVerificacoes = Object.keys(resultados).length;
    const reprovadas = totalVerificacoes - aprovadas;

    const relatorioFinal: FullReport = {
        resumo: {
            totalVerificacoes,
            aprovadas,
            reprovadas,
            statusFinal: reprovadas === 0 ? 'APROVADO' : 'REPROVADO',
        },
        detalhes: resultados as FullReport['detalhes'],
    };

    return relatorioFinal;
}
