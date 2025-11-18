
"use client"

import * as React from "react"
import {
  Column,
  Table as ReactTable,
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  RowSelectionState,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "../ui/checkbox"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  footer?: Record<string, string>;
  tableRef?: React.MutableRefObject<ReactTable<TData> | null>;
  onSelectionChange?: (rowCount: number) => void;
  rowSelection?: RowSelectionState;
  setRowSelection?: React.Dispatch<React.SetStateAction<RowSelectionState>>;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  footer,
  tableRef,
  onSelectionChange,
  rowSelection: externalRowSelection,
  setRowSelection: externalSetRowSelection
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = React.useState('')
  
  // Use internal state only if external state is not provided
  const [internalRowSelection, setInternalRowSelection] = React.useState<RowSelectionState>({});
  
  const isControllingSelection = externalRowSelection !== undefined && externalSetRowSelection !== undefined;

  const rowSelection = isControllingSelection ? externalRowSelection : internalRowSelection;
  const setRowSelection = isControllingSelection ? externalSetRowSelection : setInternalRowSelection;

  const tableColumns = React.useMemo<ColumnDef<TData, TValue>[]>(() => [
    {
        id: 'select',
        header: ({ table }) => (
            <Checkbox
                checked={table.getIsAllPageRowsSelected()}
                onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                aria-label="Selecionar todas as linhas"
                onClick={e => e.stopPropagation()}
            />
        ),
        cell: ({ row }) => {
            if (!row.getIsSelected()) {
                return null;
            }
            return (
                <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(!!value)}
                    aria-label="Selecionar linha"
                    onClick={e => e.stopPropagation()}
                />
            )
        },
        enableSorting: false,
        enableHiding: false,
    },
    ...columns
  ], [columns]);


  const table = useReactTable({
    data,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getFilteredRowModel: getFilteredRowModel(),
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true, 
    state: {
      sorting,
      columnFilters,
      globalFilter,
      rowSelection,
    },
  })
  
  React.useEffect(() => {
    if (tableRef) {
      tableRef.current = table;
    }
  }, [table, tableRef]);
  
  React.useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(Object.keys(rowSelection).length);
    }
  }, [rowSelection, onSelectionChange]);


  return (
    <div>
        <div className="flex items-center justify-between py-4">
            <Input
            placeholder="Filtrar nesta tabela..."
            value={globalFilter ?? ''}
            onChange={(event) =>
                setGlobalFilter(String(event.target.value))
            }
            className="max-w-sm"
            />
            {isControllingSelection && (
              <div className="text-sm text-muted-foreground">
                  {table.getFilteredSelectedRowModel().rows.length} de{" "}
                  {table.getFilteredRowModel().rows.length} linha(s) selecionadas.
              </div>
            )}
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} className='p-2'>
                        {header.isPlaceholder ? null : (
                            <>
                                {flexRender(
                                    header.column.columnDef.header,
                                    header.getContext()
                                )}
                                {header.column.getCanFilter() ? (
                                    <div className="mt-1">
                                        <Input
                                            type="text"
                                            value={(header.column.getFilterValue() ?? '') as string}
                                            onChange={e => header.column.setFilterValue(e.target.value)}
                                            placeholder={`Filtrar...`}
                                            className="w-full border-slate-200 h-8"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </div>
                                ) : null}
                            </>
                        )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className={isControllingSelection ? "cursor-pointer" : ""}
                  onClick={() => {
                      if (isControllingSelection) {
                          row.toggleSelected();
                      }
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell 
                      key={cell.id} 
                      onClick={(e) => {
                        const isInteractive = (e.target as HTMLElement).closest('button, a, input, [role="button"], [role="menuitem"]');
                        if (isInteractive) {
                          e.stopPropagation();
                        }
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  Nenhum resultado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
           {footer && (
            <TableFooter>
                <TableRow>
                    {columns.map((column: any) => (
                        <TableCell key={column.id} className="font-bold text-base">
                            {footer[column.id] || ''}
                        </TableCell>
                    ))}
                </TableRow>
            </TableFooter>
           )}
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Próxima
        </Button>
      </div>
    </div>
  )
}
