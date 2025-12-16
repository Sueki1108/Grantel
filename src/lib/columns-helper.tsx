
"use client"

import { ColumnDef } from "@tanstack/react-table"
import { ArrowUpDown } from "lucide-react"

type CustomCellRender<TData> = (row: { original: TData }, id: string) => React.ReactNode;

const columnNameMap: Record<string, string> = {
    'Chave de acesso': 'Chave',
    'Chave de Comparação': 'Chave de Comparação',
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
            <span>{displayName}</span>
            <ArrowUpDown className="ml-2 h-4 w-4" />
        </div>
    );
};


export function getColumns<TData extends Record<string, any>>(
    data: TData[], 
    columnsToShow?: (keyof TData)[]
): ColumnDef<TData>[] {
  if (!data || data.length === 0) {
    if (!columnsToShow || columnsToShow.length === 0) return [];
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
    
    return columnsToShow.map((key) => {
        const columnId = String(key);
        return {
            id: columnId, 
            accessorKey: columnId, 
            header: ({ column }) => renderHeader(column, columnId),
            cell: ({ row }) => {
                if (!row.original) return null;
                return customCellRender ? customCellRender(row, columnId) : (
                    <div>{String(row.getValue(columnId) ?? '')}</div>
                )
            },
        };
    });
}


export function getColumnsForDivergentTabs<TData extends Record<string, any>>(data: TData[]): ColumnDef<TData>[] {
    if (!data || data.length === 0) {
        return [];
    }

    const allKeys = new Set(data.flatMap(row => Object.keys(row)));
    const columns: ColumnDef<TData>[] = [];

    // Manually define the order and headers for consistency
    const desiredColumns: { key: keyof TData, header: string }[] = [
        { key: 'Chave de Comparação', header: 'Chave de Comparação' },
        { key: 'Fornecedor', header: 'Fornecedor' },
        { key: 'Número da Nota', header: 'Número da Nota' },
        { key: 'Emissão', header: 'Emissão' },
        { key: 'Valor Total', header: 'Valor Total' },
        { key: 'Sienge_Documento', header: 'Documento (Sienge)' },
        { key: 'Sienge_Credor', header: 'Credor (Sienge)' },
        { key: 'Sienge_Valor', header: 'Valor (Sienge)'},
    ];

    desiredColumns.forEach(({ key, header }) => {
        if (allKeys.has(String(key))) {
            columns.push({
                id: String(key), // Ensure unique ID
                accessorKey: String(key),
                header: ({ column }) => renderHeader(column, header),
                cell: ({ row }) => {
                    const value = row.original[key];
                     if (value === null || typeof value === 'undefined') {
                        return <span className="text-muted-foreground">N/A</span>;
                    }
                    return <div>{String(value)}</div>;
                }
            });
        }
    });

    // Add any remaining keys not in the desired list
    allKeys.forEach(key => {
        if (!desiredColumns.some(c => c.key === key) && key !== '__itemKey') {
             columns.push({
                id: String(key),
                accessorKey: String(key),
                header: ({ column }) => renderHeader(column, String(key)),
                cell: ({ row }) => {
                    const value = row.original[key as keyof TData];
                    if (value === null || typeof value === 'undefined') {
                        return <span className="text-muted-foreground">N/A</span>;
                    }
                    return <div>{String(value)}</div>;
                }
            });
        }
    });

    return columns;
}
