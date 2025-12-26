// src/lib/cst.ts

export const cstDescriptions: { [key: string]: string } = {
    // Tabela B – Tributação pelo ICMS
    '00': 'Tributada integralmente',
    '10': 'Tributada e com cobrança do ICMS por substituição tributária',
    '20': 'Com redução de base de cálculo',
    '30': 'Isenta ou não tributada e com cobrança do ICMS por substituição tributária',
    '40': 'Isenta',
    '41': 'Não tributada',
    '50': 'Suspensão',
    '51': 'Diferimento',
    '60': 'ICMS cobrado anteriormente por substituição tributária',
    '70': 'Com redução de base de cálculo e cobrança do ICMS por substituição tributária',
    '90': 'Outras',
};

export const csosnDescriptions: { [key: string]: string } = {
    // Tabela B - Código de Situação da Operação no Simples Nacional
    '101': 'Tributada pelo Simples Nacional com permissão de crédito',
    '102': 'Tributada pelo Simples Nacional sem permissão de crédito',
    '103': 'Isenção do ICMS no Simples Nacional para faixa de receita bruta',
    '201': 'Tributada pelo Simples Nacional com permissão de crédito e com cobrança do ICMS por substituição tributária',
    '202': 'Tributada pelo Simples Nacional sem permissão de crédito e com cobrança do ICMS por substituição tributária',
    '203': 'Isenção do ICMS no Simples Nacional para faixa de receita bruta e com cobrança do ICMS por substituição tributária',
    '300': 'Imune',
    '400': 'Não tributada pelo Simples Nacional',
    '500': 'ICMS cobrado anteriormente por substituição tributária (substituído) ou por antecipação',
    '900': 'Outros',
};

export const getCstDescription = (code: string | null | undefined): string => {
    if (!code) return 'N/A';
    const cleanCode = String(code).trim();
    return cstDescriptions[cleanCode] || csosnDescriptions[cleanCode] || 'Descrição não encontrada';
};
