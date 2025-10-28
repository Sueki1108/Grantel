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
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  footer?: Record<string, string>;
  rowSelection?: RowSelectionState;
  setRowSelection?: React.Dispatch<React.SetStateAction<RowSelectionState>>;
  tableRef?: React.MutableRefObject<ReactTable<TData> | null>;
}

function Filter({
  column,
}: {
  column: Column<any, any>
}) {
  const columnFilterValue = column.getFilterValue()

  return (
    <Input
      type="text"
      value={(columnFilterValue ?? '') as string}
      onChange={e => column.setFilterValue(e.target.value)}
      placeholder={`Filtrar...`}
      className="w-full border-slate-200 h-8"
      onClick={(e) => e.stopPropagation()}
    />
  )
}


export function DataTable<TData, TValue>({
  columns,
  data,
  footer,
  rowSelection,
  setRowSelection,
  tableRef,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = React.useState('')

  const isRowSelectionEnabled = !!rowSelection && !!setRowSelection;

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getFilteredRowModel: getFilteredRowModel(),
    onRowSelectionChange: setRowSelection,
    enableRowSelection: isRowSelectionEnabled, 
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
            {isRowSelectionEnabled && (
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
                                        <Filter column={header.column} />
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
                  data-state={isRowSelectionEnabled && row.getIsSelected() ? "selected" : undefined}
                  onClick={isRowSelectionEnabled ? () => row.toggleSelected() : undefined}
                  className={isRowSelectionEnabled ? 'cursor-pointer' : ''}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
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