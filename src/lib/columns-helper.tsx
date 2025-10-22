
"use client"

import { ColumnDef } from "@tanstack/react-table"
import { ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Row } from "@tanstack/react-table";

type CustomCellRender<TData> = (row: Row<TData>, id: string) => React.ReactNode;

export const columnNameMap: Record<string, string> = {
    'Chave de acesso': 'Chave',
    'Número da Nota': 'Nota',
    'CPF/CNPJ do Fornecedor': 'CNPJ Forn.',
    'CPF/CNPJ do Destinatário': 'CNPJ Dest.',
    'Valor Total': 'Vl. Total',
    'Valor da Prestação': 'Vl. Prest.',
    'Valor Unitário': 'Vl. Unit.',
    'Descricao CFOP': 'Desc. CFOP',
    'Chave Unica': 'Chave Única',
    'Sienge_Descrição': 'Descrição Sienge',
    'Sienge_CFOP': 'CFOP Sienge',
    'Descrição': 'Descrição XML',
    'CFOP': 'CFOP XML',
    'CST do ICMS': 'CST XML',
    'Correção Sugerida': 'Sugestão',
    'Resumo das Divergências': 'Divergências',
    'Nome do Emissor': 'Emissor',
    'CNPJ do Emissor': 'CNPJ Emissor',
    'Data de Emissão': 'Emissão',
    'Data Emissão XML': 'Emissão XML',
    'Data Emissão SPED': 'Emissão SPED',
    'Data Entrada/Saída SPED': 'Entrada/Saída SPED',
    'Valor XML': 'Vl. XML',
    'Valor SPED': 'Vl. SPED',
    'UF no XML': 'UF XML',
    'IE no XML': 'IE XML',
};


const renderHeader = (column: any, columnId: string) => {
    const displayName = columnNameMap[columnId] || columnId;
    return (
        <div 
            className="flex items-center text-left w-full cursor-pointer"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
            <span>{displayName}</span>
            <ArrowUpDown className="ml-2 h-4 w-4" />
        </div>
    );
};


export function getColumns<TData extends Record<string, any>>(data: TData[]): ColumnDef<TData>[] {
  if (!data || data.length === 0) {
    return []
  }

  const keys = Object.keys(data[0] as object) as (keyof TData)[];

  return keys.map((key) => {
      const columnId = String(key);
      return {
        id: columnId,
        accessorKey: columnId,
        header: ({ column }) => renderHeader(column, columnId),
        cell: ({ row }) => {
            const value = row.getValue(columnId);
            if (value === null || typeof value === 'undefined') {
              return <span className="text-muted-foreground">N/A</span>;
            }
            return <div>{String(value)}</div>;
        },
      };
  });
}

export function getColumnsWithCustomRender<TData extends Record<string, any>>(
    data: TData[],
    columnsToShow: (keyof TData)[],
    customCellRender?: CustomCellRender<TData>
): ColumnDef<TData>[] {
    if (!data || data.length === 0) {
        return [];
    }

    const availableColumns = Object.keys(data[0] as object) as (keyof TData)[];
    const columnsToRender = columnsToShow.filter(key => availableColumns.includes(key));

    return columnsToRender.map((key) => {
        const columnId = String(key);
        return {
            id: columnId, 
            accessorKey: columnId, 
            header: ({ column }) => renderHeader(column, columnId),
            cell: ({ row }) => customCellRender ? customCellRender(row, columnId) : (
                <div>{String(row.getValue(columnId) ?? '')}</div>
            ),
        };
    });
}
