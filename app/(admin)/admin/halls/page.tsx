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
import { apiGet, apiSend, errorMessage } from "@/lib/fetcher"
import { PageHeader } from "@/components/admin/page-header"
import { DataTable } from "@/components/admin/data-table"
import { MobileCardList } from "@/components/admin/mobile-card-list"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { EmptyState } from "@/components/admin/empty-state"
import { ErrorState } from "@/components/admin/error-state"
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
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(255, "Name must be at most 255 characters"),
  code: z
    .string()
    .trim()
    .min(2, "Code must be at least 2 characters")
    .max(50, "Code must be at most 50 characters")
    .transform((v) => v.toUpperCase()),
  capacity: z
    .number({ error: "Capacity is required" })
    .int("Capacity must be a whole number")
    .min(1, "Capacity must be at least 1"),
  latitude: z
    .number({ error: "Latitude is required" })
    .min(-90, "Latitude must be between -90 and 90")
    .max(90, "Latitude must be between -90 and 90"),
  longitude: z
    .number({ error: "Longitude is required" })
    .min(-180, "Longitude must be between -180 and 180")
    .max(180, "Longitude must be between -180 and 180"),
  description: z.string().optional(),
  isActive: z.boolean(),
})

type HallFormInput = z.input<typeof hallSchema>
type HallFormValues = z.output<typeof hallSchema>

const EMPTY_HALL: HallFormInput = {
  name: "",
  code: "",
  capacity: 50,
  latitude: Number.NaN,
  longitude: Number.NaN,
  description: "",
  isActive: true,
}

/** "6.51923, 3.37612" — or a dash when the hall has no position yet. */
function formatCoordinates(lat?: number | null, lng?: number | null): string {
  if (lat == null || lng == null) return "—"
  const la = Number(lat)
  const lo = Number(lng)
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return "—"
  return `${la.toFixed(5)}, ${lo.toFixed(5)}`
}

function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge className="border-emerald-600/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
      Active
    </Badge>
  ) : (
    <Badge variant="outline" className="border-border text-muted-foreground">
      Inactive
    </Badge>
  )
}

export default function HallsPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Hall | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Hall | null>(null)

  const {
    data: halls = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Hall[]>({
    queryKey: QUERY_KEYS.HALLS,
    queryFn: () => apiGet<Hall[]>("/api/halls"),
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.HALLS })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.NAV_HALLS })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.STATS })
  }

  const form = useForm<HallFormInput, unknown, HallFormValues>({
    resolver: zodResolver(hallSchema),
    defaultValues: EMPTY_HALL,
  })

  const openCreate = () => {
    setEditTarget(null)
    form.reset(EMPTY_HALL)
    setDialogOpen(true)
  }

  const openEdit = (hall: Hall) => {
    setEditTarget(hall)
    form.reset({
      name: hall.name,
      code: hall.code,
      capacity: hall.capacity,
      latitude: hall.latitude != null ? Number(hall.latitude) : Number.NaN,
      longitude: hall.longitude != null ? Number(hall.longitude) : Number.NaN,
      description: hall.description ?? "",
      isActive: hall.isActive,
    })
    setDialogOpen(true)
  }

  const createMutation = useMutation({
    mutationFn: (body: HallFormValues) => apiSend<Hall>("/api/halls", "POST", body),
    onSuccess: () => {
      invalidateAll()
      toast.success("Hall created")
      setDialogOpen(false)
      form.reset(EMPTY_HALL)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: HallFormValues }) =>
      apiSend<Hall>(`/api/halls/${id}`, "PUT", body),
    onSuccess: () => {
      invalidateAll()
      toast.success("Hall updated")
      setDialogOpen(false)
      setEditTarget(null)
      form.reset(EMPTY_HALL)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiSend(`/api/halls/${id}`, "DELETE"),
    onSuccess: () => {
      invalidateAll()
      toast.success("Hall deleted")
      setDeleteTarget(null)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const onSubmit = (values: HallFormValues) => {
    if (editTarget) updateMutation.mutate({ id: editTarget.id, body: values })
    else createMutation.mutate(values)
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  const columns: ColumnDef<Hall>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium text-foreground">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "code",
      header: "Code",
      cell: ({ row }) => (
        <span className="font-mono text-sm text-muted-foreground">{row.original.code}</span>
      ),
    },
    {
      accessorKey: "capacity",
      header: "Capacity",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.capacity.toLocaleString()}</span>
      ),
    },
    {
      id: "coordinates",
      header: "Coordinates",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {formatCoordinates(row.original.latitude, row.original.longitude)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <ActiveBadge active={row.original.isActive} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground" />}>
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Open menu</span>
              </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-foreground/70 focus:bg-muted focus:text-foreground"
                onClick={() => openEdit(row.original)}
              >
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:bg-muted focus:text-destructive"
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
        description="Inactive halls are not used for new timetables and are hidden from students' hall list"
        action={{ label: "Add Hall", onClick: openCreate }}
      />

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !isLoading && halls.length === 0 ? (
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
                    <p className="font-medium text-foreground">{hall.name}</p>
                    <p className="text-sm text-muted-foreground">{hall.code} · {hall.capacity.toLocaleString()} seats</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {formatCoordinates(hall.latitude, hall.longitude)}
                    </p>
                    <div className="mt-1">
                      <ActiveBadge active={hall.isActive} />
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground" />}>
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="text-foreground/70 focus:bg-muted" onClick={() => openEdit(hall)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:bg-muted" onClick={() => setDeleteTarget(hall)}>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            />
          </div>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Hall" : "Add Hall"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-foreground/70">Name</Label>
                <Input placeholder="e.g. Main Auditorium" {...form.register("name")} />
                {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-foreground/70">Code</Label>
                <Input placeholder="e.g. MA-01" className="uppercase" {...form.register("code")} />
                {form.formState.errors.code && <p className="text-sm text-destructive">{form.formState.errors.code.message}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-foreground/70">Capacity</Label>
              <Input type="number" min={1} {...form.register("capacity", { valueAsNumber: true })} />
              {form.formState.errors.capacity && <p className="text-sm text-destructive">{form.formState.errors.capacity.message}</p>}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-foreground/70">Latitude</Label>
                <Input type="number" step="any" placeholder="e.g. 6.51923" {...form.register("latitude", { valueAsNumber: true })} />
                {form.formState.errors.latitude && <p className="text-sm text-destructive">{form.formState.errors.latitude.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-foreground/70">Longitude</Label>
                <Input type="number" step="any" placeholder="e.g. 3.37612" {...form.register("longitude", { valueAsNumber: true })} />
                {form.formState.errors.longitude && <p className="text-sm text-destructive">{form.formState.errors.longitude.message}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-foreground/70">Description (optional)</Label>
              <Input placeholder="Additional notes about the hall" {...form.register("description")} />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="isActive"
                type="checkbox"
                className="size-4 rounded border-border accent-foreground"
                {...form.register("isActive")}
              />
              <Label htmlFor="isActive" className="text-foreground/70 cursor-pointer">Active</Label>
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
        description={`Delete "${deleteTarget?.name}"? A hall that already has exam seat assignments cannot be deleted — deactivate it instead, or reset the timetable first. This action cannot be undone.`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
