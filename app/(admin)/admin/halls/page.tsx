"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { MoreHorizontal, DoorOpen } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"

import { QUERY_KEYS } from "@/lib/query-keys"
import { PageHeader } from "@/components/admin/page-header"
import { DataTable } from "@/components/admin/data-table"
import { MobileCardList } from "@/components/admin/mobile-card-list"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { EmptyState } from "@/components/admin/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface Hall {
  id: string
  name: string
  code: string
  capacity: number
  latitude?: number | null
  longitude?: number | null
  description?: string | null
  isActive: boolean
}

const hallSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required"),
  capacity: z.number().int().min(1, "Capacity must be at least 1"),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  description: z.string().optional(),
  isActive: z.boolean(),
})

type HallFormValues = z.infer<typeof hallSchema>

export default function HallsPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Hall | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Hall | null>(null)

  const { data: halls = [], isLoading } = useQuery<Hall[]>({
    queryKey: QUERY_KEYS.HALLS,
    queryFn: async () => {
      const res = await fetch("/api/halls")
      const json = await res.json()
      return json.data ?? []
    },
  })

  const form = useForm<HallFormValues>({
    resolver: zodResolver(hallSchema),
    defaultValues: {
      name: "",
      code: "",
      capacity: 50,
      latitude: undefined,
      longitude: undefined,
      description: "",
      isActive: true,
    },
  })

  const openCreate = () => {
    setEditTarget(null)
    form.reset({ name: "", code: "", capacity: 50, latitude: undefined, longitude: undefined, description: "", isActive: true })
    setDialogOpen(true)
  }

  const openEdit = (hall: Hall) => {
    setEditTarget(hall)
    form.reset({
      name: hall.name,
      code: hall.code,
      capacity: hall.capacity,
      latitude: hall.latitude ?? undefined,
      longitude: hall.longitude ?? undefined,
      description: hall.description ?? "",
      isActive: hall.isActive,
    })
    setDialogOpen(true)
  }

  const createMutation = useMutation({
    mutationFn: async (body: HallFormValues) => {
      const res = await fetch("/api/halls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
      return json.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.HALLS })
      toast.success("Hall created")
      setDialogOpen(false)
      form.reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: async (body: HallFormValues) => {
      const res = await fetch(`/api/halls/${editTarget!.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
      return json.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.HALLS })
      toast.success("Hall updated")
      setDialogOpen(false)
      setEditTarget(null)
      form.reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/halls/${id}`, { method: "DELETE" })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.HALLS })
      toast.success("Hall deleted")
      setDeleteTarget(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const onSubmit = (values: HallFormValues) => {
    if (editTarget) updateMutation.mutate(values)
    else createMutation.mutate(values)
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  const columns: ColumnDef<Hall>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium text-zinc-50">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "code",
      header: "Code",
      cell: ({ row }) => (
        <span className="font-mono text-sm text-zinc-400">{row.original.code}</span>
      ),
    },
    {
      accessorKey: "capacity",
      header: "Capacity",
      cell: ({ row }) => (
        <span className="text-zinc-400">{row.original.capacity.toLocaleString()}</span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) =>
        row.original.isActive ? (
          <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-400">Active</Badge>
        ) : (
          <Badge variant="outline" className="border-zinc-700 text-zinc-500">Inactive</Badge>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="text-zinc-400 hover:text-zinc-50" />}>
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Open menu</span>
              </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
              <DropdownMenuItem
                className="text-zinc-300 focus:bg-zinc-800 focus:text-zinc-50"
                onClick={() => openEdit(row.original)}
              >
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-400 focus:bg-zinc-800 focus:text-red-400"
                onClick={() => setDeleteTarget(row.original)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Halls"
        description="Manage examination halls and venues"
        action={{ label: "Add Hall", onClick: openCreate }}
      />

      {!isLoading && halls.length === 0 ? (
        <EmptyState
          icon={DoorOpen}
          title="No halls yet"
          description="Add your first examination hall to get started"
          action={{ label: "Add Hall", onClick: openCreate }}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable columns={columns} data={halls} isLoading={isLoading} />
          </div>
          <div className="md:hidden">
            <MobileCardList
              items={halls}
              isLoading={isLoading}
              renderCard={(hall) => (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-zinc-50">{hall.name}</p>
                    <p className="text-sm text-zinc-400">{hall.code} · {hall.capacity.toLocaleString()} seats</p>
                    <div className="mt-1">
                      {hall.isActive ? (
                        <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-400 text-xs">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-xs">Inactive</Badge>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="text-zinc-400" />}>
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                      <DropdownMenuItem className="text-zinc-300 focus:bg-zinc-800" onClick={() => openEdit(hall)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem className="text-red-400 focus:bg-zinc-800" onClick={() => setDeleteTarget(hall)}>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            />
          </div>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-50">{editTarget ? "Edit Hall" : "Add Hall"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-300">Name</Label>
                <Input placeholder="e.g. Main Auditorium" {...form.register("name")} />
                {form.formState.errors.name && <p className="text-sm text-red-400">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-300">Code</Label>
                <Input placeholder="e.g. MA-01" {...form.register("code")} />
                {form.formState.errors.code && <p className="text-sm text-red-400">{form.formState.errors.code.message}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-300">Capacity</Label>
              <Input type="number" min={1} {...form.register("capacity", { valueAsNumber: true })} />
              {form.formState.errors.capacity && <p className="text-sm text-red-400">{form.formState.errors.capacity.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-300">Latitude</Label>
                <Input type="number" step="any" placeholder="e.g. 6.5244" {...form.register("latitude", { valueAsNumber: true })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-300">Longitude</Label>
                <Input type="number" step="any" placeholder="e.g. 3.3792" {...form.register("longitude", { valueAsNumber: true })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-300">Description (optional)</Label>
              <Input placeholder="Additional notes about the hall" {...form.register("description")} />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="isActive"
                type="checkbox"
                className="size-4 rounded border-zinc-600 accent-zinc-50"
                {...form.register("isActive")}
              />
              <Label htmlFor="isActive" className="text-zinc-300 cursor-pointer">Active</Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>Cancel</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? "Saving…" : editTarget ? "Update" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete Hall"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
