
"use client";

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatCnpj = (cnpj: string) => {
    if (!cnpj) return '';
    const digitsOnly = cnpj.replace(/\D/g, '');
    if (digitsOnly.length !== 14) return cnpj;
    return digitsOnly.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
};

export const cleanAndToStr = (value: any): string => {
    if (value === null || typeof value === 'undefined') return "";
    // Primeiro, converte para string e remove espaços em branco
    let strValue = String(value).trim();
    
    // Remove a parte decimal se for apenas .0 ou .00, etc.
    if (/\.0+$/.test(strValue)) {
        strValue = strValue.split('.')[0];
    }
    
    // Remove todos os caracteres que não são dígitos
    return strValue.replace(/\D/g, '');
};


export const parseSpedDate = (dateStr: string): Date => {
    if (!dateStr || dateStr.length !== 8) return new Date('invalid');
    const day = parseInt(dateStr.substring(0, 2), 10);
    const month = parseInt(dateStr.substring(2, 4), 10) - 1; // Mês é 0-indexado
    const year = parseInt(dateStr.substring(4, 8), 10);
    return new Date(year, month, day);
};

export const normalizeKey = (key: any): string => {
    if (key === null || typeof key === 'undefined') return '';
    return String(key).toLowerCase().replace(/[\s._\/-]/g, '');
}
