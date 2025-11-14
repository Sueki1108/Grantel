
export type SaidaStatus = 'emitida' | 'cancelada' | 'inutilizada';

export interface SaidaItem {
    numero: number;
    status: SaidaStatus;
    data?: any; // Original data from the sheet
    isGap?: boolean;
    'Destinatário'?: string;
    'Emissão'?: string;
    'CFOP'?: string;
    'Base ICMS'?: number;
    'Alíq. ICMS (%)'?: number;
    'Valor ICMS'?: number;
    'Total'?: number;
}

export type SpedDuplicate = {
    'Tipo de Registo': string;
    'Número do Documento': string;
    'Série': string;
    'CNPJ/CPF': string;
    'Fornecedor': string;
    'Data Emissão': string;
    'Valor Total': number;
    'Linhas': string;
};
