"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { MoreHorizontal, Clock } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"

import { QUERY_KEYS } from "@/lib/query-keys"
import { apiGet, apiSend, errorMessage } from "@/lib/fetcher"
import { PageHeader } from "@/components/admin/page-header"
import { DataTable } from "@/components/admin/data-table"
import { MobileCardList } from "@/components/admin/mobile-card-list"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { EmptyState } from "@/components/admin/empty-state"
import { ErrorState } from "@/components/admin/error-state"
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

/**
 * Values arrive as ISO strings: `date` = "YYYY-MM-DDT00:00:00.000Z",
 * `startTime`/`endTime` = "1970-01-01THH:MM:00.000Z". Both hold Lagos wall-clock
 * values, so they are always read with UTC getters.
 */
interface TimeSlot {
  id: string
  label: string
  date: string
  startTime: string
  endTime: string
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

const slotSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(2, "Label must be at least 2 characters")
      .max(100, "Label must be at most 100 characters"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    startTime: z.string().regex(TIME_PATTERN, "Start time must be HH:MM"),
    endTime: z.string().regex(TIME_PATTERN, "End time must be HH:MM"),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: "End time must be after the start time",
    path: ["endTime"],
  })

type SlotFormValues = z.infer<typeof slotSchema>

const pad2 = (n: number) => String(n).padStart(2, "0")

/** "YYYY-MM-DD" from an ISO date (or an already-plain date string). */
function toDateInput(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

/** "HH:MM" from an ISO time (or an already-plain time string). */
function toTimeInput(value: string): string {
  if (TIME_PATTERN.test(value)) return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
}

function formatDate(value: string): string {
  const ymd = toDateInput(value)
  if (!ymd) return value
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-NG", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

export default function SlotsPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<TimeSlot | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TimeSlot | null>(null)

  const {
    data: slots = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<TimeSlot[]>({
    queryKey: QUERY_KEYS.SLOTS,
    queryFn: () => apiGet<TimeSlot[]>("/api/slots"),
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SLOTS })
    queryClient.invalidateQueries({ queryKey: ["timetable"] })
  }

  const form = useForm<SlotFormValues>({
    resolver: zodResolver(slotSchema),
    defaultValues: { label: "", date: "", startTime: "", endTime: "" },
  })

  const openCreate = () => {
    setEditTarget(null)
    form.reset({ label: "", date: "", startTime: "", endTime: "" })
    setDialogOpen(true)
  }

  const openEdit = (slot: TimeSlot) => {
    setEditTarget(slot)
    form.reset({
      label: slot.label,
      date: toDateInput(slot.date),
      startTime: toTimeInput(slot.startTime),
      endTime: toTimeInput(slot.endTime),
    })
    setDialogOpen(true)
  }

  const createMutation = useMutation({
    mutationFn: (body: SlotFormValues) => apiSend<TimeSlot>("/api/slots", "POST", body),
    onSuccess: () => {
      invalidateAll()
      toast.success("Time slot created")
      setDialogOpen(false)
      form.reset()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: SlotFormValues }) =>
      apiSend<TimeSlot>(`/api/slots/${id}`, "PUT", body),
    onSuccess: () => {
      invalidateAll()
      toast.success("Time slot updated")
      setDialogOpen(false)
      setEditTarget(null)
      form.reset()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiSend(`/api/slots/${id}`, "DELETE"),
    onSuccess: () => {
      invalidateAll()
      toast.success("Time slot deleted")
      setDeleteTarget(null)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const onSubmit = (values: SlotFormValues) => {
    if (editTarget) updateMutation.mutate({ id: editTarget.id, body: values })
    else createMutation.mutate(values)
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  const columns: ColumnDef<TimeSlot>[] = [
    {
      accessorKey: "label",
      header: "Label",
      cell: ({ row }) => (
        <span className="font-medium text-foreground">{row.original.label}</span>
      ),
    },
    {
      accessorKey: "date",
      header: "Date",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatDate(row.original.date)}</span>
      ),
    },
    {
      accessorKey: "startTime",
      header: "Start",
      cell: ({ row }) => (
        <span className="font-mono text-sm text-muted-foreground">{toTimeInput(row.original.startTime)}</span>
      ),
    },
    {
      accessorKey: "endTime",
      header: "End",
      cell: ({ row }) => (
        <span className="font-mono text-sm text-muted-foreground">{toTimeInput(row.original.endTime)}</span>
      ),
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
        title="Time Slots"
        description="Advanced: examination time slots (the timetable generator creates these automatically)"
        action={{ label: "Add Slot", onClick: openCreate }}
      />

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !isLoading && slots.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No time slots yet"
          description="Add your first time slot to get started"
          action={{ label: "Add Slot", onClick: openCreate }}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable columns={columns} data={slots} isLoading={isLoading} />
          </div>
          <div className="md:hidden">
            <MobileCardList
              items={slots}
              isLoading={isLoading}
              renderCard={(slot) => (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-foreground">{slot.label}</p>
                    <p className="text-sm text-muted-foreground">{formatDate(slot.date)}</p>
                    <p className="font-mono text-xs text-muted-foreground mt-1">
                      {toTimeInput(slot.startTime)} – {toTimeInput(slot.endTime)}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground" />}>
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="text-foreground/70 focus:bg-muted" onClick={() => openEdit(slot)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:bg-muted" onClick={() => setDeleteTarget(slot)}>Delete</DropdownMenuItem>
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
            <DialogTitle>{editTarget ? "Edit Time Slot" : "Add Time Slot"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-foreground/70">Label</Label>
              <Input placeholder="e.g. Monday Morning" {...form.register("label")} />
              {form.formState.errors.label && <p className="text-sm text-destructive">{form.formState.errors.label.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-foreground/70">Date (YYYY-MM-DD)</Label>
              <Input type="date" placeholder="2026-01-20" {...form.register("date")} />
              {form.formState.errors.date && <p className="text-sm text-destructive">{form.formState.errors.date.message}</p>}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-foreground/70">Start Time (HH:MM)</Label>
                <Input type="time" placeholder="08:00" {...form.register("startTime")} />
                {form.formState.errors.startTime && <p className="text-sm text-destructive">{form.formState.errors.startTime.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-foreground/70">End Time (HH:MM)</Label>
                <Input type="time" placeholder="10:00" {...form.register("endTime")} />
                {form.formState.errors.endTime && <p className="text-sm text-destructive">{form.formState.errors.endTime.message}</p>}
              </div>
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
        title="Delete Time Slot"
        description={`Are you sure you want to delete "${deleteTarget?.label}"? This action cannot be undone.`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
