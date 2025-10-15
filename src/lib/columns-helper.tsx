"use client"

import { ColumnDef } from "@tanstack/react-table"
import { ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Row } from "@tanstack/react-table";

type CustomCellRender<TData> = (row: Row<TData>, id: string) => React.ReactNode;

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
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              {columnId}
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
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
            id: columnId, // Explicitly set the ID
            accessorKey: columnId, // And the accessorKey
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    {columnId}
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
            ),
            cell: ({ row }) => customCellRender ? customCellRender(row, columnId) : (
                <div>{String(row.getValue(columnId) ?? '')}</div>
            ),
        };
    });
}
