
"use client"

import { ColumnDef } from "@tanstack/react-table"
import { ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Row } from "@tanstack/react-table";

type CustomCellRender<TData> = (row: Row<TData>, id: string) => React.ReactNode;

const columnNameMap: Record<string, string> = {
    'Chave de acesso': 'Chave',
    'Número da Nota': 'Nota',
    'CPF/CNPJ do Fornecedor': 'CNPJ Forn.',
    'CPF/CNPJ do Destinatário': 'CNPJ Dest.',
    'Valor Total': 'Vl. Total',
    'Valor da Prestação': 'Vl. Prest.',
    'Valor Unitário': 'Vl. Unit.',
    'Descricao CFOP': 'Desc. CFOP',
    'Chave Unica': 'Chave Única',
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
            <Button variant="ghost" className="p-0 hover:bg-transparent">
                {displayName}
                <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
        </div>
    );
};


export function getColumns<TData extends Record<string, any>>(
    data: TData[], 
    columnsToShow?: (keyof TData)[]
): ColumnDef<TData>[] {
  if (!data || data.length === 0) {
    if (!columnsToShow || columnsToShow.length === 0) return [];
    // If no data but explicit columns, create them anyway to ensure table structure
    return columnsToShow.map(key => ({
      id: String(key),
      accessorKey: String(key),
      header: ({ column }) => renderHeader(column, String(key)),
      cell: () => null,
    }));
  }

  const allKeys = new Set<string>();
  data.forEach(row => {
    if (row && typeof row === 'object') {
        Object.keys(row).forEach(key => allKeys.add(key));
    }
  });

  const keys = columnsToShow ? columnsToShow.filter(key => allKeys.has(String(key))) : Array.from(allKeys);

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
    
    // Always render all columns from the explicit list, even if data is initially empty.
    // This prevents hydration issues in production.
    return columnsToShow.map((key) => {
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
