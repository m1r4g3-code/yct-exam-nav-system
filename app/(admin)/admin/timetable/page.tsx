"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CalendarRange, RefreshCw, Send, Trash2 } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"

import { QUERY_KEYS } from "@/lib/query-keys"
import { VALID_SESSIONS, DEFAULT_SESSION } from "@/lib/constants"
import { DataTable } from "@/components/admin/data-table"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { StatusBadge } from "@/components/admin/status-badge"
import { EmptyState } from "@/components/admin/empty-state"
import { Button } from "@/components/ui/button"
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
  DialogDescription,
} from "@/components/ui/dialog"


interface Level {
  id: string
  name: string
}

interface TimeSlotOption {
  id: string
  label: string
  date: string
  startTime: string
  endTime: string
}

interface TimetableEntry {
  id: string
  status: "DRAFT" | "PUBLISHED"
  timeSlotId: string
  course: {
    id: string
    code: string
    title: string
    level: { id: string; name: string; year: number }
  }
  timeSlot: {
    id: string
    date: string
    startTime: string
    endTime: string
    label: string
  }
  hallAssignments: {
    id: string
    examHall: { id: string; name: string; code: string; capacity: number }
  }[]
}

interface GenerateResult {
  assigned: number
  unresolved: { code: string; title: string }[]
  overflow: { code: string; title: string }[]
}

export default function TimetablePage() {
  const queryClient = useQueryClient()

  const [session, setSession] = useState<string>("")
  const [levelId, setLevelId] = useState<string>("all")

  const [generateDialogOpen, setGenerateDialogOpen] = useState(false)
  const [generateResultOpen, setGenerateResultOpen] = useState(false)
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null)

  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)

  const [editSlotEntryId, setEditSlotEntryId] = useState<string | null>(null)
  const [selectedNewSlotId, setSelectedNewSlotId] = useState<string>("")

  const { data: levels = [] } = useQuery<Level[]>({
    queryKey: QUERY_KEYS.LEVELS(undefined),
    queryFn: async () => {
      const res = await fetch("/api/levels")
      const json = await res.json()
      return json.data ?? []
    },
  })

  const { data: slots = [] } = useQuery<TimeSlotOption[]>({
    queryKey: QUERY_KEYS.SLOTS,
    queryFn: async () => {
      const res = await fetch("/api/slots")
      const json = await res.json()
      return json.data ?? []
    },
  })

  const levelIdParam = levelId !== "all" ? levelId : undefined

  const { data: entries = [], isLoading } = useQuery<TimetableEntry[]>({
    queryKey: QUERY_KEYS.TIMETABLE(session || undefined, levelIdParam),
    queryFn: async () => {
      if (!session) return []
      const params = new URLSearchParams({ session })
      if (levelIdParam) params.set("level_id", levelIdParam)
      const res = await fetch(`/api/timetable?${params}`)
      const json = await res.json()
      return json.data ?? []
    },
    enabled: !!session,
  })

  const hasDraft = entries.some((e) => e.status === "DRAFT")

  const generateMutation = useMutation({
    mutationFn: async (force: boolean) => {
      const res = await fetch("/api/timetable/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, force }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
      return json.data as GenerateResult
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["timetable"] })
      setGenerateDialogOpen(false)
      setGenerateResult(data)
      setGenerateResultOpen(true)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const publishMutation = useMutation({
    mutationFn: async () => {
      const encoded = encodeURIComponent(session)
      const res = await fetch(`/api/timetable/${encoded}/publish`, { method: "PUT" })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timetable"] })
      toast.success("Timetable published")
      setPublishDialogOpen(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const resetMutation = useMutation({
    mutationFn: async () => {
      const encoded = encodeURIComponent(session)
      const res = await fetch(`/api/timetable/${encoded}/reset`, { method: "DELETE" })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timetable"] })
      toast.success("Draft reset")
      setResetDialogOpen(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const moveSlotMutation = useMutation({
    mutationFn: async ({ entryId, newTimeSlotId }: { entryId: string; newTimeSlotId: string }) => {
      const res = await fetch(`/api/timetable/entry/${entryId}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newTimeSlotId }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timetable"] })
      toast.success("Slot updated")
      setEditSlotEntryId(null)
      setSelectedNewSlotId("")
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const columns: ColumnDef<TimetableEntry>[] = [
    {
      id: "courseCode",
      header: "Code",
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium text-zinc-50">{row.original.course.code}</span>
      ),
    },
    {
      id: "courseTitle",
      header: "Title",
      cell: ({ row }) => (
        <span className="text-zinc-300">{row.original.course.title}</span>
      ),
    },
    {
      id: "levelName",
      header: "Level",
      cell: ({ row }) => (
        <span className="text-zinc-400">{row.original.course.level.name}</span>
      ),
    },
    {
      id: "date",
      header: "Date",
      cell: ({ row }) => (
        <span className="text-zinc-400">{row.original.timeSlot.date}</span>
      ),
    },
    {
      id: "startTime",
      header: "Time",
      cell: ({ row }) => (
        <span className="font-mono text-sm text-zinc-400">
          {row.original.timeSlot.startTime}–{row.original.timeSlot.endTime}
        </span>
      ),
    },
    {
      id: "halls",
      header: "Halls",
      cell: ({ row }) => (
        <span className="text-zinc-400 text-sm">
          {row.original.hallAssignments.map((ha) => ha.examHall.name).join(", ") || "—"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          className="text-zinc-400 hover:text-zinc-50"
          onClick={() => {
            setEditSlotEntryId(row.original.id)
            setSelectedNewSlotId(row.original.timeSlotId)
          }}
        >
          Edit Slot
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-row items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-50">Timetable</h1>
          <p className="mt-0.5 text-sm text-zinc-400">Generate and manage examination timetables</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setGenerateDialogOpen(true)}
            disabled={!session}
          >
            <RefreshCw className="mr-1.5 size-4" />
            Generate
          </Button>

          {hasDraft && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPublishDialogOpen(true)}
              disabled={publishMutation.isPending}
            >
              <Send className="mr-1.5 size-4" />
              Publish All
            </Button>
          )}

          {entries.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-red-400 border-red-900 hover:bg-red-950 hover:text-red-300"
              onClick={() => setResetDialogOpen(true)}
              disabled={!session}
            >
              <Trash2 className="mr-1.5 size-4" />
              Reset Draft
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={session} onValueChange={(v) => v != null && setSession(v)}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select session" />
          </SelectTrigger>
          <SelectContent>
            {VALID_SESSIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={levelId} onValueChange={(v) => v != null && setLevelId(v)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            {levels.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!session ? (
        <EmptyState
          icon={CalendarRange}
          title="Select a session"
          description="Choose a session above to view the timetable"
        />
      ) : !isLoading && entries.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No timetable entries"
          description="Generate a timetable for this session"
          action={{ label: "Generate", onClick: () => setGenerateDialogOpen(true) }}
        />
      ) : (
        <DataTable columns={columns} data={entries} isLoading={isLoading} />
      )}

      {/* Generate confirmation dialog */}
      <ConfirmDialog
        open={generateDialogOpen}
        onOpenChange={setGenerateDialogOpen}
        title="Generate Timetable"
        description={`This will generate a new timetable for "${session}". Any existing draft entries will be deleted and replaced. Published entries are not affected unless you use force mode. Proceed?`}
        onConfirm={() => generateMutation.mutate(true)}
        loading={generateMutation.isPending}
      />

      {/* Generate result dialog */}
      <Dialog open={generateResultOpen} onOpenChange={setGenerateResultOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-zinc-50">Generation Complete</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Timetable generation finished for {session}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-sm text-zinc-300">
              <span className="font-medium text-emerald-400">{generateResult?.assigned ?? 0}</span>{" "}
              courses assigned successfully.
            </p>

            {(generateResult?.unresolved?.length ?? 0) > 0 && (
              <div>
                <p className="text-sm font-medium text-amber-400 mb-1">
                  Unresolved ({generateResult!.unresolved.length})
                </p>
                <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                  {generateResult!.unresolved.map((c) => (
                    <li key={c.code} className="text-xs text-zinc-400">
                      <span className="font-mono text-zinc-300">{c.code}</span> — {c.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(generateResult?.overflow?.length ?? 0) > 0 && (
              <div>
                <p className="text-sm font-medium text-red-400 mb-1">
                  Overflow / No Hall ({generateResult!.overflow.length})
                </p>
                <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                  {generateResult!.overflow.map((c) => (
                    <li key={c.code} className="text-xs text-zinc-400">
                      <span className="font-mono text-zinc-300">{c.code}</span> — {c.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={() => setGenerateResultOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Publish confirmation */}
      <ConfirmDialog
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        title="Publish Timetable"
        description={`Publish all draft entries for "${session}"? Students will be able to view their exam schedule.`}
        onConfirm={() => publishMutation.mutate()}
        loading={publishMutation.isPending}
      />

      {/* Reset confirmation */}
      <ConfirmDialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        title="Reset Draft"
        description={`Delete all DRAFT entries for "${session}"? Published entries will not be affected.`}
        onConfirm={() => resetMutation.mutate()}
        loading={resetMutation.isPending}
      />

      {/* Edit slot dialog */}
      <Dialog
        open={!!editSlotEntryId}
        onOpenChange={(v) => {
          if (!v) {
            setEditSlotEntryId(null)
            setSelectedNewSlotId("")
          }
        }}
      >
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-50">Move to Different Slot</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-zinc-300">Select Time Slot</Label>
            <Select value={selectedNewSlotId} onValueChange={(v) => v != null && setSelectedNewSlotId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a slot" />
              </SelectTrigger>
              <SelectContent>
                {slots.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label} — {s.date} {s.startTime}–{s.endTime}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditSlotEntryId(null)
                setSelectedNewSlotId("")
              }}
              disabled={moveSlotMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              disabled={!selectedNewSlotId || moveSlotMutation.isPending}
              onClick={() => {
                if (editSlotEntryId && selectedNewSlotId) {
                  moveSlotMutation.mutate({ entryId: editSlotEntryId, newTimeSlotId: selectedNewSlotId })
                }
              }}
            >
              {moveSlotMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
