"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { MoreHorizontal, Layers } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"

import { QUERY_KEYS } from "@/lib/query-keys"
import { PageHeader } from "@/components/admin/page-header"
import { DataTable } from "@/components/admin/data-table"
import { MobileCardList } from "@/components/admin/mobile-card-list"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { EmptyState } from "@/components/admin/empty-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

interface Programme {
  id: string
  name: string
}

interface Level {
  id: string
  name: string
  year: number
  programmeId: string
  programme?: { name: string }
}

const levelSchema = z.object({
  name: z.string().min(1, "Name is required"),
  year: z.number().int().min(1).max(4),
  programmeId: z.string().min(1, "Programme is required"),
})

type LevelFormValues = z.infer<typeof levelSchema>

export default function LevelsPage() {
  const queryClient = useQueryClient()
  const [filterProgId, setFilterProgId] = useState<string>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Level | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Level | null>(null)

  const { data: programmes = [] } = useQuery<Programme[]>({
    queryKey: QUERY_KEYS.PROGRAMMES(undefined),
    queryFn: async () => {
      const res = await fetch("/api/programmes")
      const json = await res.json()
      return json.data ?? []
    },
  })

  const progIdParam = filterProgId !== "all" ? filterProgId : undefined

  const { data: levels = [], isLoading } = useQuery<Level[]>({
    queryKey: QUERY_KEYS.LEVELS(progIdParam),
    queryFn: async () => {
      const url = progIdParam
        ? `/api/levels?programme_id=${progIdParam}`
        : "/api/levels"
      const res = await fetch(url)
      const json = await res.json()
      return json.data ?? []
    },
  })

  const form = useForm<LevelFormValues>({
    resolver: zodResolver(levelSchema),
    defaultValues: { name: "", year: 1, programmeId: "" },
  })

  const openCreate = () => {
    setEditTarget(null)
    form.reset({ name: "", year: 1, programmeId: "" })
    setDialogOpen(true)
  }

  const openEdit = (level: Level) => {
    setEditTarget(level)
    form.reset({ name: level.name, year: level.year, programmeId: level.programmeId })
    setDialogOpen(true)
  }

  const createMutation = useMutation({
    mutationFn: async (body: LevelFormValues) => {
      const res = await fetch("/api/levels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
      return json.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["levels"] })
      toast.success("Level created")
      setDialogOpen(false)
      form.reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: async (body: LevelFormValues) => {
      const res = await fetch(`/api/levels/${editTarget!.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
      return json.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["levels"] })
      toast.success("Level updated")
      setDialogOpen(false)
      setEditTarget(null)
      form.reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/levels/${id}`, { method: "DELETE" })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["levels"] })
      toast.success("Level deleted")
      setDeleteTarget(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const onSubmit = (values: LevelFormValues) => {
    if (editTarget) updateMutation.mutate(values)
    else createMutation.mutate(values)
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  const getProgName = (programmeId: string) =>
    programmes.find((p) => p.id === programmeId)?.name ?? "—"

  const columns: ColumnDef<Level>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium text-zinc-50">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "year",
      header: "Year",
      cell: ({ row }) => (
        <span className="text-zinc-400">{row.original.year}</span>
      ),
    },
    {
      id: "programme",
      header: "Programme",
      cell: ({ row }) => (
        <span className="text-zinc-400">
          {row.original.programme?.name ?? getProgName(row.original.programmeId)}
        </span>
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
        title="Levels"
        description="Manage academic levels within programmes"
        action={{ label: "Add Level", onClick: openCreate }}
      />

      <div className="flex items-center gap-3">
        <Select value={filterProgId} onValueChange={(v) => v != null && setFilterProgId(v)}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Filter by programme" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Programmes</SelectItem>
            {programmes.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!isLoading && levels.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No levels found"
          description="Add your first level to get started"
          action={{ label: "Add Level", onClick: openCreate }}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable columns={columns} data={levels} isLoading={isLoading} />
          </div>
          <div className="md:hidden">
            <MobileCardList
              items={levels}
              isLoading={isLoading}
              renderCard={(level) => (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-zinc-50">{level.name}</p>
                    <p className="text-sm text-zinc-400">Year {level.year}</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      {level.programme?.name ?? getProgName(level.programmeId)}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="text-zinc-400" />}>
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                      <DropdownMenuItem
                        className="text-zinc-300 focus:bg-zinc-800"
                        onClick={() => openEdit(level)}
                      >
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-400 focus:bg-zinc-800"
                        onClick={() => setDeleteTarget(level)}
                      >
                        Delete
                      </DropdownMenuItem>
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
            <DialogTitle className="text-zinc-50">
              {editTarget ? "Edit Level" : "Add Level"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Programme</Label>
              <Select
                value={form.watch("programmeId")}
                onValueChange={(v) => v != null && form.setValue("programmeId", v, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select programme" />
                </SelectTrigger>
                <SelectContent>
                  {programmes.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.programmeId && (
                <p className="text-sm text-red-400">{form.formState.errors.programmeId.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-300">Name</Label>
              <Input placeholder="e.g. 100 Level" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-sm text-red-400">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-300">Year (1–4)</Label>
              <Input type="number" min={1} max={4} {...form.register("year", { valueAsNumber: true })} />
              {form.formState.errors.year && (
                <p className="text-sm text-red-400">{form.formState.errors.year.message}</p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving…" : editTarget ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete Level"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
