import { KeyCheckResult } from "@/components/app/key-checker";
import { ReconciliationResults, SpedCorrectionResult, SpedInfo } from "./excel-processor";

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

export type Classification = 'unclassified' | 'imobilizado' | 'uso-consumo' | 'utilizado-em-obra' | 'verify';

export type SupplierCategory = {
    id: string;
    name: string;
    icon: string;
    blockedCfops: string[];
};

export type DifalStatus = 'subject-to-difal' | 'disregard';

export interface AllClassifications {
    supplierCategories?: SupplierCategory[];
    [competence: string]: {
        classifications: {
            [uniqueItemId: string]: { classification: Classification };
        };
        accountCodes: {
            [itemLineId: string]: { accountCode: string };
        };
        cfopValidations: {
            classifications: {
                [uniqueKey: string]: {
                    classification: 'correct' | 'incorrect' | 'verify' | 'unvalidated';
                    isDifal?: boolean;
                }
            }
        },
        difalValidations?: {
            classifications: {
                [uniqueKey: string]: {
                    status: DifalStatus;
                }
            }
        },
        supplierClassifications?: {
            [supplierCnpj: string]: string | null; // categoryId or null
        }
    }
}
