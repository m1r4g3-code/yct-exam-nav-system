"use client"

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"

interface DataTableProps<TData, TValue = unknown> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  isLoading?: boolean
}

export function DataTable<TData, TValue = unknown>({
  columns,
  data,
  isLoading = false,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="border-zinc-800 hover:bg-transparent bg-zinc-900/50">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="text-zinc-400 font-medium px-5 py-3.5 text-xs uppercase tracking-wide">
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, rowIndex) => (
              <TableRow key={rowIndex} className="border-zinc-800">
                {columns.map((_, colIndex) => (
                  <TableCell key={colIndex} className="px-5 py-4">
                    <Skeleton className="h-4 w-full bg-zinc-800" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : table.getRowModel().rows.length === 0 ? (
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableCell
                colSpan={columns.length}
                className="h-24 text-center text-sm text-zinc-500"
              >
                No results.
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="border-zinc-800 hover:bg-zinc-800/40 transition-colors"
                data-state={row.getIsSelected() ? "selected" : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="px-5 py-4">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
