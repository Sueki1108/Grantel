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
  PaginationState,
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
import { cn } from "@/lib/utils"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  footer?: Record<string, string>;
  tableRef?: React.MutableRefObject<ReactTable<TData> | null>;
  onSelectionChange?: (rowCount: number) => void;
  rowSelection?: RowSelectionState;
  setRowSelection?: React.Dispatch<React.SetStateAction<RowSelectionState>>;
  pageSize?: number;
  autoResetPageIndex?: boolean;
  getRowId?: (row: TData, index: number, parent?: any) => string;
  getRowClassName?: (row: TData) => string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  footer,
  tableRef,
  onSelectionChange,
  rowSelection: externalRowSelection,
  setRowSelection: externalSetRowSelection,
  pageSize = 10,
  autoResetPageIndex = true,
  getRowId,
  getRowClassName,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = React.useState('')
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });
  
  const [internalRowSelection, setInternalRowSelection] = React.useState<RowSelectionState>({});
  
  const isControllingSelection = externalRowSelection !== undefined && externalSetRowSelection !== undefined;

  const rowSelection = isControllingSelection ? externalRowSelection : internalRowSelection;
  const setRowSelection = isControllingSelection ? externalSetRowSelection : setInternalRowSelection;

  const table = useReactTable({
    data,
    columns,
    autoResetPageIndex,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getFilteredRowModel: getFilteredRowModel(),
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    enableRowSelection: isControllingSelection, 
    state: {
      sorting,
      columnFilters,
      globalFilter,
      rowSelection,
      pagination,
    },
  })
  
  React.useEffect(() => {
    if (tableRef) {
      tableRef.current = table;
    }
  }, [table, tableRef]);
  
  React.useEffect(() => {
    if (onSelectionChange && isControllingSelection) {
      onSelectionChange(Object.keys(rowSelection).length);
    }
  }, [rowSelection, onSelectionChange, isControllingSelection]);

  React.useEffect(() => {
    table.setPageSize(pageSize);
  }, [pageSize, table]);

  const pageRows = table.getRowModel().rows;
  const emptyRowsCount = pagination.pageSize - pageRows.length;

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
                 {isControllingSelection && <TableHead className='p-2 w-[40px]'><Checkbox checked={table.getIsAllPageRowsSelected()} onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)} aria-label="Selecionar todas as linhas" /></TableHead>}
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id} className='p-2'>
                        {header.isPlaceholder ? null : (
                           flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                            )
                        )}
                        {header.column.getCanFilter() && (
                          <div className="mt-1">
                            <Input
                              placeholder={`Filtrar...`}
                              value={(header.column.getFilterValue() as string) ?? ""}
                              onChange={(event) =>
                                header.column.setFilterValue(event.target.value)
                              }
                              className="h-7 w-full text-xs font-normal"
                            />
                          </div>
                        )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {pageRows.length ? (
              <>
                {pageRows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    className={cn(
                        isControllingSelection ? "cursor-pointer" : "",
                        getRowClassName?.(row.original)
                    )}
                    onClick={() => {
                        if (isControllingSelection) {
                            row.toggleSelected();
                        }
                    }}
                  >
                    {isControllingSelection && <TableCell className="p-2"><Checkbox checked={row.getIsSelected()} onCheckedChange={(value) => row.toggleSelected(!!value)} aria-label="Selecionar linha" onClick={(e) => e.stopPropagation()} /></TableCell>}
                    {row.getVisibleCells().map((cell) => (
                      <TableCell 
                        key={cell.id} 
                        onClick={(e) => {
                          const target = e.target as HTMLElement;
                          const isInteractive = target.closest('button, a, input, [role="button"], [role="checkbox"]');
                          if (isInteractive) {
                            e.stopPropagation();
                          }
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {emptyRowsCount > 0 && (
                  <TableRow style={{ height: `${emptyRowsCount * 53}px` }}>
                    <TableCell colSpan={columns.length + (isControllingSelection ? 1 : 0)} />
                  </TableRow>
                )}
              </>
            ) : (
              <TableRow>
                <TableCell colSpan={table.getAllColumns().length} className="h-24 text-center">
                  Nenhum resultado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
           {footer && (
            <TableFooter>
                <TableRow>
                     {isControllingSelection && <TableCell />}
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
      <div className="flex items-center justify-between py-4">
          <div className="text-sm text-muted-foreground">
            Página {table.getState().pagination.pageIndex + 1} de{" "}
            {table.getPageCount()}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Anterior
            </Button>
            
            <div className="flex items-center gap-1">
              {(() => {
                const pageCount = table.getPageCount();
                const currentPage = table.getState().pagination.pageIndex;
                const pages = [];
                
                // Determinar o intervalo de páginas a serem exibidas (máximo 5)
                let startPage = Math.max(0, currentPage - 2);
                let endPage = Math.min(pageCount - 1, startPage + 4);
                
                if (endPage - startPage < 4) {
                  startPage = Math.max(0, endPage - 4);
                }

                for (let i = startPage; i <= endPage; i++) {
                  pages.push(
                    <Button
                      key={i}
                      variant={currentPage === i ? "default" : "outline"}
                      size="sm"
                      className="w-9 h-9 p-0"
                      onClick={() => table.setPageIndex(i)}
                    >
                      {i + 1}
                    </Button>
                  );
                }
                return pages;
              })()}
            </div>

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
    </div>
  )
}
