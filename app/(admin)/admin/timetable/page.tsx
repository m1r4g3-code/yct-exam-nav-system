"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CalendarRange, RefreshCw, Send, Trash2 } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"

import { QUERY_KEYS } from "@/lib/query-keys"
import { VALID_SESSIONS } from "@/lib/constants"
import { DataTable } from "@/components/admin/data-table"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { StatusBadge } from "@/components/admin/status-badge"
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
  DialogDescription,
} from "@/components/ui/dialog"

interface School { id: string; name: string }

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

/** Returns the next Monday as YYYY-MM-DD */
function nextMonday(): string {
  const today = new Date()
  const day = today.getDay() // 0=Sun,1=Mon,...
  const daysToMonday = day === 0 ? 1 : day === 1 ? 7 : 8 - day
  const d = new Date(today)
  d.setDate(today.getDate() + daysToMonday)
  return d.toISOString().split("T")[0]
}

/** Format an ISO date string (e.g. "2024-01-15T00:00:00.000Z") as "Mon, 15 Jan 2024" */
function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-NG", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  })
}

/** Format an ISO time string (e.g. "1970-01-01T08:00:00.000Z") as "8:00 AM" */
function formatTime(iso: string): string {
  const d = new Date(iso)
  const h = d.getUTCHours()
  const m = d.getUTCMinutes()
  const ampm = h >= 12 ? "PM" : "AM"
  const hour = h % 12 || 12
  return `${hour}:${m.toString().padStart(2, "0")} ${ampm}`
}

export default function TimetablePage() {
  const queryClient = useQueryClient()

  const [session, setSession] = useState<string>("")
  const [levelId, setLevelId] = useState<string>("all")

  // Generate dialog state
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false)
  const [generateSchoolId, setGenerateSchoolId] = useState<string>("all")
  const [generateExamStartDate, setGenerateExamStartDate] = useState<string>(nextMonday)

  const [generateResultOpen, setGenerateResultOpen] = useState(false)
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null)

  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)

  const [editSlotEntryId, setEditSlotEntryId] = useState<string | null>(null)
  const [selectedNewSlotId, setSelectedNewSlotId] = useState<string>("")

  const { data: schools = [] } = useQuery<School[]>({
    queryKey: QUERY_KEYS.SCHOOLS,
    queryFn: async () => {
      const res = await fetch("/api/schools")
      const json = await res.json()
      return json.data ?? []
    },
  })

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

  // Deduplicate levels by name — multiple departments each create ND1/ND2/HND1/HND2,
  // resulting in duplicate names when all levels are fetched without a programme filter.
  const uniqueLevels = levels.filter(
    (l, i, arr) => arr.findIndex((x) => x.name === l.name) === i
  )

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
    mutationFn: async (params: {
      force: boolean
      schoolId?: string
      examStartDate?: string
    }) => {
      const res = await fetch("/api/timetable/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, ...params }),
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
        <span className="text-zinc-400">{formatDate(row.original.timeSlot.date)}</span>
      ),
    },
    {
      id: "startTime",
      header: "Time",
      cell: ({ row }) => (
        <span className="text-sm text-zinc-400">
          {formatTime(row.original.timeSlot.startTime)} – {formatTime(row.original.timeSlot.endTime)}
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
            <SelectValue>
              {session || "Select session"}
            </SelectValue>
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
            <SelectValue>
              {levelId === "all" ? "All Levels" : (uniqueLevels.find(l => l.id === levelId)?.name ?? "Level")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            {uniqueLevels.map((l) => (
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

      {/* ── Generate dialog ───────────────────────────────────────────── */}
      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-zinc-50">Generate Timetable</DialogTitle>
            <DialogDescription className="text-zinc-400">
              The system will automatically create exam slots and assign courses using
              DSatur graph coloring. Existing draft entries for{" "}
              <span className="text-zinc-300 font-medium">&ldquo;{session}&rdquo;</span> will be
              replaced.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* School filter */}
            <div className="space-y-1.5">
              <Label className="text-zinc-300">School</Label>
              <Select
                value={generateSchoolId}
                onValueChange={(v) => v != null && setGenerateSchoolId(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {generateSchoolId === "all"
                      ? "All Schools"
                      : (schools.find((s) => s.id === generateSchoolId)?.name ?? "School")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Schools</SelectItem>
                  {schools.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-zinc-500">
                Filter to one school or generate for all at once
              </p>
            </div>

            {/* Exam start date */}
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Exam Start Date</Label>
              <Input
                type="date"
                value={generateExamStartDate}
                onChange={(e) => setGenerateExamStartDate(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-zinc-50"
              />
              <p className="text-xs text-zinc-500">
                Mon–Fri exam slots (8:00 AM–10:00 AM and 12:00 PM–2:00 PM) will be auto-created
                for 2 weeks (10 days) from this date
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setGenerateDialogOpen(false)}
              disabled={generateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              disabled={generateMutation.isPending}
              onClick={() =>
                generateMutation.mutate({
                  force: true,
                  schoolId: generateSchoolId !== "all" ? generateSchoolId : undefined,
                  examStartDate: generateExamStartDate || undefined,
                })
              }
            >
              {generateMutation.isPending ? "Generating…" : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  Hall Overflow ({generateResult!.overflow.length})
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
                    {s.label} — {formatDate(s.date)}, {formatTime(s.startTime)}–{formatTime(s.endTime)}
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
