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
import { PageHeader } from "@/components/admin/page-header"
import { DataTable } from "@/components/admin/data-table"
import { MobileCardList } from "@/components/admin/mobile-card-list"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { EmptyState } from "@/components/admin/empty-state"
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

interface TimeSlot {
  id: string
  label: string
  date: string
  startTime: string
  endTime: string
}

const slotSchema = z.object({
  label: z.string().min(1, "Label is required"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Start time must be HH:MM"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "End time must be HH:MM"),
})

type SlotFormValues = z.infer<typeof slotSchema>

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-NG", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  } catch {
    return dateStr
  }
}

export default function SlotsPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<TimeSlot | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TimeSlot | null>(null)

  const { data: slots = [], isLoading } = useQuery<TimeSlot[]>({
    queryKey: QUERY_KEYS.SLOTS,
    queryFn: async () => {
      const res = await fetch("/api/slots")
      const json = await res.json()
      return json.data ?? []
    },
  })

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
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
    })
    setDialogOpen(true)
  }

  const createMutation = useMutation({
    mutationFn: async (body: SlotFormValues) => {
      const res = await fetch("/api/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
      return json.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SLOTS })
      toast.success("Time slot created")
      setDialogOpen(false)
      form.reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: async (body: SlotFormValues) => {
      const res = await fetch(`/api/slots/${editTarget!.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
      return json.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SLOTS })
      toast.success("Time slot updated")
      setDialogOpen(false)
      setEditTarget(null)
      form.reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/slots/${id}`, { method: "DELETE" })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SLOTS })
      toast.success("Time slot deleted")
      setDeleteTarget(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const onSubmit = (values: SlotFormValues) => {
    if (editTarget) updateMutation.mutate(values)
    else createMutation.mutate(values)
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  const columns: ColumnDef<TimeSlot>[] = [
    {
      accessorKey: "label",
      header: "Label",
      cell: ({ row }) => (
        <span className="font-medium text-zinc-50">{row.original.label}</span>
      ),
    },
    {
      accessorKey: "date",
      header: "Date",
      cell: ({ row }) => (
        <span className="text-zinc-400">{formatDate(row.original.date)}</span>
      ),
    },
    {
      accessorKey: "startTime",
      header: "Start",
      cell: ({ row }) => (
        <span className="font-mono text-sm text-zinc-400">{row.original.startTime}</span>
      ),
    },
    {
      accessorKey: "endTime",
      header: "End",
      cell: ({ row }) => (
        <span className="font-mono text-sm text-zinc-400">{row.original.endTime}</span>
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
        title="Time Slots"
        description="Manage examination time slots"
        action={{ label: "Add Slot", onClick: openCreate }}
      />

      {!isLoading && slots.length === 0 ? (
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
                    <p className="font-medium text-zinc-50">{slot.label}</p>
                    <p className="text-sm text-zinc-400">{formatDate(slot.date)}</p>
                    <p className="font-mono text-xs text-zinc-500 mt-1">
                      {slot.startTime} – {slot.endTime}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="text-zinc-400" />}>
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                      <DropdownMenuItem className="text-zinc-300 focus:bg-zinc-800" onClick={() => openEdit(slot)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem className="text-red-400 focus:bg-zinc-800" onClick={() => setDeleteTarget(slot)}>Delete</DropdownMenuItem>
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
            <DialogTitle className="text-zinc-50">{editTarget ? "Edit Time Slot" : "Add Time Slot"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Label</Label>
              <Input placeholder="e.g. Monday Morning" {...form.register("label")} />
              {form.formState.errors.label && <p className="text-sm text-red-400">{form.formState.errors.label.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-300">Date (YYYY-MM-DD)</Label>
              <Input placeholder="2025-01-20" {...form.register("date")} />
              {form.formState.errors.date && <p className="text-sm text-red-400">{form.formState.errors.date.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-300">Start Time (HH:MM)</Label>
                <Input placeholder="08:00" {...form.register("startTime")} />
                {form.formState.errors.startTime && <p className="text-sm text-red-400">{form.formState.errors.startTime.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-300">End Time (HH:MM)</Label>
                <Input placeholder="10:00" {...form.register("endTime")} />
                {form.formState.errors.endTime && <p className="text-sm text-red-400">{form.formState.errors.endTime.message}</p>}
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
