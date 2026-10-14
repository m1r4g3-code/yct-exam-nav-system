"use client"

import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CalendarRange, Eye, EyeOff, RefreshCw, Send, Trash2, Plus, Users } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"

import { QUERY_KEYS } from "@/lib/query-keys"
import { apiGet, apiSend, errorMessage } from "@/lib/fetcher"
import { DEFAULT_EXAM_WEEKS, MAX_EXAM_WEEKS } from "@/lib/services/exam-slots"
import { DataTable } from "@/components/admin/data-table"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { StatusBadge } from "@/components/admin/status-badge"
import { EmptyState } from "@/components/admin/empty-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
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
interface SessionOption { id: string; name: string; isActive: boolean }

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
    level: {
      id: string
      name: string
      year: number
      programme: { department: { id: string; name: string } }
    }
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
  slotsUsed?: number
  examPeriod?: { from: string; to: string } | null
}

interface SeatAssignment {
  id: string
  seatNumber: number | null
  student: { id: string; matricNumber: string; fullName: string }
  timetableEntry: {
    course: { id: string; code: string; title: string }
    timeSlot: { date: string; startTime: string; endTime: string; label: string }
  }
  examHall: { id: string; name: string; code: string }
}

const EXAM_WEEK_OPTIONS = Array.from({ length: MAX_EXAM_WEEKS }, (_, i) => i + 1)

/** The coming Monday (a week ahead when today is Monday), as YYYY-MM-DD in local time. */
function nextMonday(): string {
  const today = new Date()
  const day = today.getDay()
  const daysToMonday = day === 0 ? 1 : day === 1 ? 7 : 8 - day
  const d = new Date(today)
  d.setDate(today.getDate() + daysToMonday)
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NG", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  })
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const h = d.getUTCHours()
  const m = d.getUTCMinutes()
  const ampm = h >= 12 ? "PM" : "AM"
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`
}

const weeksLabel = (n: number) => `${n} week${n === 1 ? "" : "s"}`

export default function TimetablePage() {
  const queryClient = useQueryClient()

  const [selectedSession, setSession] = useState<string>("")
  const [activeTab, setActiveTab] = useState<string>("all")

  const [generateDialogOpen, setGenerateDialogOpen] = useState(false)
  const [generateSchoolId, setGenerateSchoolId] = useState<string>("all")
  const [generateExamStartDate, setGenerateExamStartDate] = useState<string>(nextMonday)
  const [generateExamWeeks, setGenerateExamWeeks] = useState<number>(DEFAULT_EXAM_WEEKS)

  const [generateResultOpen, setGenerateResultOpen] = useState(false)
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null)

  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)

  const [editSlotEntryId, setEditSlotEntryId] = useState<string | null>(null)
  const [selectedNewSlotId, setSelectedNewSlotId] = useState<string>("")

  const [newSessionDialogOpen, setNewSessionDialogOpen] = useState(false)
  const [newSessionYear, setNewSessionYear] = useState("")
  const [newSessionSemester, setNewSessionSemester] = useState<"First" | "Second">("First")

  const [assignmentsDialogOpen, setAssignmentsDialogOpen] = useState(false)
  const [deleteSessionDialogOpen, setDeleteSessionDialogOpen] = useState(false)

  const { data: sessions = [] } = useQuery<SessionOption[]>({
    queryKey: QUERY_KEYS.SESSIONS,
    queryFn: () => apiGet<SessionOption[]>("/api/sessions"),
    staleTime: 5 * 60 * 1000,
  })

  // Sessions arrive newest first; until the officer picks one, show the newest active session.
  const session = selectedSession || (sessions.find((s) => s.isActive)?.name ?? "")
  const sessionObj = sessions.find((s) => s.name === session)

  const { data: schools = [] } = useQuery<School[]>({
    queryKey: QUERY_KEYS.SCHOOLS,
    queryFn: () => apiGet<School[]>("/api/schools"),
    staleTime: 60 * 60 * 1000,
  })

  const { data: slots = [] } = useQuery<TimeSlotOption[]>({
    queryKey: QUERY_KEYS.SLOTS,
    queryFn: () => apiGet<TimeSlotOption[]>("/api/slots"),
    staleTime: 5 * 60 * 1000,
  })

  const {
    data: entries = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<TimetableEntry[]>({
    queryKey: QUERY_KEYS.TIMETABLE(session || undefined),
    queryFn: () => apiGet<TimetableEntry[]>(`/api/timetable?session=${encodeURIComponent(session)}`),
    enabled: !!session,
  })

  const hasDraft = entries.some((e) => e.status === "DRAFT")
  const hasPublished = entries.some((e) => e.status === "PUBLISHED")

  const departments = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of entries) {
      const dept = e.course.level.programme.department
      if (!map.has(dept.id)) map.set(dept.id, dept.name)
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [entries])

  const visibleEntries = useMemo(() => {
    const filtered = activeTab === "all"
      ? entries
      : entries.filter((e) => e.course.level.programme.department.id === activeTab)
    // Sort: ND before HND, then by year within programme, then date, then time
    return [...filtered].sort((a, b) => {
      const levelKey = (name: string, year: number) =>
        name.startsWith("HND") ? year + 10 : year
      const lvl = levelKey(a.course.level.name, a.course.level.year) -
                  levelKey(b.course.level.name, b.course.level.year)
      if (lvl !== 0) return lvl
      const dateDiff = new Date(a.timeSlot.date).getTime() - new Date(b.timeSlot.date).getTime()
      if (dateDiff !== 0) return dateDiff
      return new Date(a.timeSlot.startTime).getTime() - new Date(b.timeSlot.startTime).getTime()
    })
  }, [entries, activeTab])

  // Slots offered by Edit Slot: those from this timetable's first exam day onwards.
  const movableSlots = useMemo(() => {
    if (entries.length === 0) return slots
    const firstDay = Math.min(...entries.map((e) => new Date(e.timeSlot.date).getTime()))
    return slots.filter((s) => new Date(s.date).getTime() >= firstDay)
  }, [slots, entries])

  const refreshTimetable = () => {
    queryClient.invalidateQueries({ queryKey: ["timetable"] })
    queryClient.invalidateQueries({ queryKey: ["assignments"] })
  }

  const generateMutation = useMutation({
    mutationFn: (params: { force: boolean; schoolId?: string; examStartDate: string; examWeeks: number }) =>
      apiSend<GenerateResult>("/api/timetable/generate", "POST", { session, ...params }),
    onSuccess: ({ data }) => {
      refreshTimetable()
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SLOTS })
      setGenerateDialogOpen(false)
      setGenerateResult(data)
      setGenerateResultOpen(true)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const publishMutation = useMutation({
    mutationFn: () => apiSend(`/api/timetable/${encodeURIComponent(session)}/publish`, "PUT"),
    onSuccess: () => {
      refreshTimetable()
      if (sessionObj && !sessionObj.isActive) {
        toast.success("Timetable published", {
          description: "This session is Inactive — students won't see it until you make it Active.",
        })
      } else {
        toast.success("Timetable published — students can now see their exams")
      }
      setPublishDialogOpen(false)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const resetMutation = useMutation({
    // ?confirm=published bypasses the published-entries guard — the ConfirmDialog
    // already presents an explicit "delete draft AND published" warning.
    mutationFn: () =>
      apiSend(`/api/timetable/${encodeURIComponent(session)}/reset?confirm=published`, "DELETE"),
    onSuccess: () => {
      refreshTimetable()
      toast.success("Timetable reset")
      setResetDialogOpen(false)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const moveSlotMutation = useMutation({
    mutationFn: ({ entryId, newTimeSlotId }: { entryId: string; newTimeSlotId: string }) =>
      apiSend(`/api/timetable/entry/${entryId}/move`, "PATCH", { newTimeSlotId }),
    onSuccess: ({ message }) => {
      refreshTimetable()
      toast.success(message || "Exam moved")
      setEditSlotEntryId(null)
      setSelectedNewSlotId("")
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery<SeatAssignment[]>({
    queryKey: ["assignments", session],
    queryFn: () => apiGet<SeatAssignment[]>(`/api/assignments?session=${encodeURIComponent(session)}`),
    enabled: assignmentsDialogOpen && !!session,
    staleTime: 60 * 1000,
  })

  const createSessionMutation = useMutation({
    mutationFn: (name: string) => apiSend<SessionOption>("/api/sessions", "POST", { name }),
    onSuccess: ({ data }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SESSIONS })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.STATS })
      setSession(data.name)
      setActiveTab("all")
      setNewSessionYear("")
      setNewSessionSemester("First")
      setNewSessionDialogOpen(false)
      toast.success(`Session "${data.name}" created`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const toggleActiveMutation = useMutation({
    mutationFn: (target: SessionOption) =>
      apiSend<SessionOption>(`/api/sessions/${target.id}`, "PATCH", { isActive: !target.isActive }),
    onSuccess: ({ message }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SESSIONS })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.STATS })
      toast.success(message)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const deleteSessionMutation = useMutation({
    mutationFn: () => {
      if (!sessionObj) throw new Error("Session not found")
      const confirm = hasPublished ? "?confirm=published" : ""
      return apiSend(`/api/sessions/${sessionObj.id}${confirm}`, "DELETE")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SESSIONS })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.STATS })
      refreshTimetable()
      toast.success("Session deleted")
      setSession("")
      setActiveTab("all")
      setDeleteSessionDialogOpen(false)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const columns: ColumnDef<TimetableEntry>[] = [
    {
      accessorKey: "course.code",
      id: "courseCode",
      header: "Code",
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium text-foreground">{row.original.course.code}</span>
      ),
    },
    {
      accessorKey: "course.title",
      id: "courseTitle",
      header: "Title",
      cell: ({ row }) => (
        <span className="text-foreground/80">{row.original.course.title}</span>
      ),
    },
    {
      accessorKey: "course.level.name",
      id: "levelName",
      header: "Level",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">{row.original.course.level.name}</span>
      ),
    },
    {
      accessorKey: "timeSlot.date",
      id: "date",
      header: "Date",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">{formatDate(row.original.timeSlot.date)}</span>
      ),
    },
    {
      accessorKey: "timeSlot.startTime",
      id: "startTime",
      header: "Time",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatTime(row.original.timeSlot.startTime)} – {formatTime(row.original.timeSlot.endTime)}
        </span>
      ),
    },
    {
      id: "halls",
      header: "Halls",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
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
      cell: ({ row }) =>
        row.original.status === "PUBLISHED" ? (
          <span
            className="px-3 text-xs text-muted-foreground"
            title="Published exams can't be moved. Use Reset All to change a published timetable."
          >
            Locked
          </span>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
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

  const allColumns: ColumnDef<TimetableEntry>[] = [
    {
      accessorKey: "course.level.programme.department.name",
      id: "deptName",
      header: "Department",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm font-medium">
          {row.original.course.level.programme.department.name}
        </span>
      ),
    },
    ...columns,
  ]

  const selectedSlot = slots.find((s) => s.id === selectedNewSlotId)
  const slotLabel = (s: TimeSlotOption) =>
    `${s.label} — ${formatDate(s.date)}, ${formatTime(s.startTime)}–${formatTime(s.endTime)}`

  return (
    <div className="space-y-6">
      <div className="flex flex-row items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Timetable</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Generate and manage examination timetables</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setGenerateDialogOpen(true)} disabled={!session}>
            <RefreshCw className="mr-1.5 size-4" />
            Generate
          </Button>

          {hasPublished && (
            <Button variant="outline" size="sm" onClick={() => setAssignmentsDialogOpen(true)}>
              <Users className="mr-1.5 size-4" />
              Seat Assignments
            </Button>
          )}

          {hasDraft && (
            <Button variant="outline" size="sm" onClick={() => setPublishDialogOpen(true)} disabled={publishMutation.isPending}>
              <Send className="mr-1.5 size-4" />
              Publish All
            </Button>
          )}

          {entries.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setResetDialogOpen(true)}
              disabled={!session}
            >
              <Trash2 className="mr-1.5 size-4" />
              Reset All
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={session} onValueChange={(v) => { if (v != null) { setSession(v); setActiveTab("all") } }}>
          <SelectTrigger className="w-72">
            <SelectValue>
              {session ? `${session}${sessionObj && !sessionObj.isActive ? " (inactive)" : ""}` : "Select session"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {sessions.map((s) => (
              <SelectItem key={s.id} value={s.name}>
                {s.name}
                {!s.isActive && <span className="ml-1 text-muted-foreground">(inactive)</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => setNewSessionDialogOpen(true)} title="Create new session">
          <Plus className="size-4" />
        </Button>
        {sessionObj && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Keep showing this session after the list refreshes (it may stop being the default).
              setSession(sessionObj.name)
              toggleActiveMutation.mutate(sessionObj)
            }}
            disabled={toggleActiveMutation.isPending}
            title={
              sessionObj.isActive
                ? "Active — visible to students. Click to hide it from students."
                : "Inactive — hidden from students. Click to make it visible."
            }
            className={
              sessionObj.isActive
                ? "border-emerald-600/40 text-emerald-700 hover:text-emerald-700 dark:text-emerald-400"
                : "text-muted-foreground"
            }
          >
            {sessionObj.isActive ? <Eye className="mr-1.5 size-4" /> : <EyeOff className="mr-1.5 size-4" />}
            {sessionObj.isActive ? "Active" : "Inactive"}
          </Button>
        )}
        {session && (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDeleteSessionDialogOpen(true)}
            title="Delete this session"
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>

      {!session ? (
        <EmptyState
          icon={CalendarRange}
          title="Select a session"
          description="Choose a session above, or create one with +"
        />
      ) : isError ? (
        <EmptyState
          icon={CalendarRange}
          title="Couldn't load the timetable"
          description={errorMessage(error)}
          action={{ label: "Try again", onClick: () => refetch() }}
        />
      ) : !isLoading && entries.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No timetable entries"
          description="Generate a timetable for this session"
          action={{ label: "Generate", onClick: () => setGenerateDialogOpen(true) }}
        />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="overflow-x-auto pb-1">
            <TabsList className="w-max">
              <TabsTrigger value="all">All ({entries.length})</TabsTrigger>
              {departments.map((d) => {
                const count = entries.filter(
                  (e) => e.course.level.programme.department.id === d.id
                ).length
                return (
                  <TabsTrigger key={d.id} value={d.id}>
                    {d.name} ({count})
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </div>

          <TabsContent value="all" className="mt-4">
            <DataTable columns={allColumns} data={visibleEntries} isLoading={isLoading} />
          </TabsContent>

          {departments.map((d) => (
            <TabsContent key={d.id} value={d.id} className="mt-4">
              <DataTable columns={columns} data={visibleEntries} isLoading={isLoading} />
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* Generate dialog */}
      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Timetable</DialogTitle>
            <DialogDescription>
              The system creates the exam slots, schedules every course without clashes and assigns
              halls and seats. Existing draft entries for{" "}
              <span className="text-foreground font-medium">
                {generateSchoolId !== "all"
                  ? `${schools.find((s) => s.id === generateSchoolId)?.name ?? "selected school"} in "${session}"`
                  : `"${session}"`}
              </span>{" "}
              will be replaced.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>School</Label>
              <Select value={generateSchoolId} onValueChange={(v) => v != null && setGenerateSchoolId(v)}>
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
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Generate for one school or all at once — halls already booked by other schools are respected.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Exam Start Date</Label>
                <Input
                  type="date"
                  value={generateExamStartDate}
                  onChange={(e) => setGenerateExamStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Exam Period</Label>
                <Select
                  value={String(generateExamWeeks)}
                  onValueChange={(v) => v != null && setGenerateExamWeeks(Number(v))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{weeksLabel(generateExamWeeks)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {EXAM_WEEK_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>{weeksLabel(n)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Monday–Friday slots (8:00–10:00 AM and 12:00–2:00 PM) are created automatically for the exam period.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateDialogOpen(false)} disabled={generateMutation.isPending}>
              Cancel
            </Button>
            <Button
              disabled={generateMutation.isPending || !generateExamStartDate}
              onClick={() =>
                generateMutation.mutate({
                  force: true,
                  schoolId: generateSchoolId !== "all" ? generateSchoolId : undefined,
                  examStartDate: generateExamStartDate,
                  examWeeks: generateExamWeeks,
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Generation Complete</DialogTitle>
            <DialogDescription>
              Draft timetable created for {session}
              {generateResult?.examPeriod
                ? ` (${formatDate(generateResult.examPeriod.from)} – ${formatDate(generateResult.examPeriod.to)})`
                : ""}
              . Review it, then Publish All.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-sm text-foreground">
              <span className="font-medium text-emerald-600 dark:text-emerald-400">{generateResult?.assigned ?? 0}</span>{" "}
              courses scheduled
              {generateResult?.slotsUsed ? ` across ${generateResult.slotsUsed} time slots` : ""}.
            </p>

            {(generateResult?.unresolved?.length ?? 0) > 0 && (
              <div>
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-1">
                  Unresolved ({generateResult!.unresolved.length})
                </p>
                <p className="text-xs text-muted-foreground mb-1.5">
                  No clash-free slot was left for these courses — choose a longer exam period and generate again.
                </p>
                <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                  {generateResult!.unresolved.map((c) => (
                    <li key={c.code} className="text-xs text-muted-foreground">
                      <span className="font-mono text-foreground/80">{c.code}</span> — {c.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(generateResult?.overflow?.length ?? 0) > 0 && (
              <div>
                <p className="text-sm font-medium text-destructive mb-1">
                  Hall Overflow ({generateResult!.overflow.length})
                </p>
                <p className="text-xs text-muted-foreground mb-1.5">
                  Not enough hall space for these courses — add halls or capacity, or choose a longer exam period, and generate again.
                </p>
                <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                  {generateResult!.overflow.map((c) => (
                    <li key={c.code} className="text-xs text-muted-foreground">
                      <span className="font-mono text-foreground/80">{c.code}</span> — {c.title}
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

      <ConfirmDialog
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        title="Publish Timetable"
        description={
          sessionObj && !sessionObj.isActive
            ? `Publish all draft entries for "${session}"? This session is Inactive — students won't see it until you make it Active.`
            : `Publish all draft entries for "${session}"? Students will be able to view their exam schedule.`
        }
        onConfirm={() => publishMutation.mutate()}
        loading={publishMutation.isPending}
        confirmLabel="Publish"
        variant="default"
      />

      <ConfirmDialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        title="Reset Timetable"
        description={`Delete ALL timetable entries (draft and published) for "${session}"? This cannot be undone. You will need to regenerate and republish.`}
        onConfirm={() => resetMutation.mutate()}
        loading={resetMutation.isPending}
        confirmLabel="Reset"
      />

      {/* Seat Assignments dialog */}
      <Dialog open={assignmentsDialogOpen} onOpenChange={setAssignmentsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Seat Assignments</DialogTitle>
            <DialogDescription>All student seat assignments for &ldquo;{session}&rdquo;</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto mt-2">
            {assignmentsLoading ? (
              <div className="space-y-2 py-4">
                {[1,2,3,4,5].map((i) => (
                  <div key={i} className="flex gap-4">
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : assignments.length === 0 ? (
              <div className="py-8 text-center space-y-1">
                <p className="text-sm text-muted-foreground">No individual seat assignments for this session.</p>
                <p className="text-xs text-muted-foreground/60">Seats are assigned to enrolled students. If students have not yet enrolled in courses for this session, generate the timetable again after they enrol.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background border-b border-border">
                  <tr className="text-left">
                    <th className="pb-2 pr-6 font-medium text-muted-foreground">Student</th>
                    <th className="pb-2 pr-6 font-medium text-muted-foreground">Course</th>
                    <th className="pb-2 pr-6 font-medium text-muted-foreground whitespace-nowrap">Date</th>
                    <th className="pb-2 pr-6 font-medium text-muted-foreground">Hall</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Seat</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => (
                    <tr key={a.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                      <td className="py-3 pr-6">
                        <p className="text-sm text-foreground/90 leading-tight">{a.student.fullName}</p>
                        <p className="font-mono text-[11px] text-muted-foreground/60 mt-0.5">{a.student.matricNumber}</p>
                      </td>
                      <td className="py-3 pr-6 font-mono text-xs font-semibold text-foreground whitespace-nowrap">{a.timetableEntry.course.code}</td>
                      <td className="py-3 pr-6 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(a.timetableEntry.timeSlot.date).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
                      </td>
                      <td className="py-3 pr-6 font-mono text-xs text-muted-foreground whitespace-nowrap">{a.examHall.code}</td>
                      <td className="py-3 font-mono text-sm font-bold text-right tabular-nums">{a.seatNumber ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button onClick={() => setAssignmentsDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create session dialog */}
      <Dialog open={newSessionDialogOpen} onOpenChange={(v) => {
        setNewSessionDialogOpen(v)
        if (!v) { setNewSessionYear(""); setNewSessionSemester("First") }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Academic Session</DialogTitle>
            <DialogDescription>
              Enter the start year and choose the semester. New sessions are visible to students.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Start year</Label>
              <Input
                placeholder="e.g. 2027"
                maxLength={4}
                value={newSessionYear}
                onChange={(e) => setNewSessionYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const y = parseInt(newSessionYear, 10)
                    const name = `${y}/${y + 1} ${newSessionSemester} Semester`
                    if (newSessionYear.length === 4 && !createSessionMutation.isPending)
                      createSessionMutation.mutate(name)
                  }
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Semester</Label>
              <Select value={newSessionSemester} onValueChange={(v) => v != null && setNewSessionSemester(v as "First" | "Second")}>
                <SelectTrigger className="w-full">
                  <SelectValue>{newSessionSemester} Semester</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="First">First Semester</SelectItem>
                  <SelectItem value="Second">Second Semester</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newSessionYear.length === 4 && (
              <p className="text-xs text-muted-foreground">
                Will create: <span className="font-mono text-foreground">
                  {newSessionYear}/{parseInt(newSessionYear) + 1} {newSessionSemester} Semester
                </span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewSessionDialogOpen(false); setNewSessionYear(""); setNewSessionSemester("First") }} disabled={createSessionMutation.isPending}>
              Cancel
            </Button>
            <Button
              disabled={newSessionYear.length !== 4 || createSessionMutation.isPending}
              onClick={() => {
                const y = parseInt(newSessionYear, 10)
                createSessionMutation.mutate(`${y}/${y + 1} ${newSessionSemester} Semester`)
              }}
            >
              {createSessionMutation.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteSessionDialogOpen}
        onOpenChange={setDeleteSessionDialogOpen}
        title="Delete Session"
        description={
          hasPublished
            ? `"${session}" has a PUBLISHED timetable. Deleting the session removes it for all students, together with every draft entry. Student enrollment records are preserved. This cannot be undone.`
            : `Permanently delete "${session}" and all its timetable entries? Student enrollment records are preserved. This cannot be undone.`
        }
        onConfirm={() => deleteSessionMutation.mutate()}
        loading={deleteSessionMutation.isPending}
        confirmLabel="Delete session"
      />

      {/* Edit slot dialog */}
      <Dialog
        open={!!editSlotEntryId}
        onOpenChange={(v) => {
          if (!v) { setEditSlotEntryId(null); setSelectedNewSlotId("") }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to Different Slot</DialogTitle>
            <DialogDescription>
              The move is checked for clashes, and halls and seats are re-assigned automatically for the new slot.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Select Time Slot</Label>
            <Select value={selectedNewSlotId} onValueChange={(v) => v != null && setSelectedNewSlotId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a slot">
                  {selectedSlot ? slotLabel(selectedSlot) : "Choose a slot"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {movableSlots.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {slotLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setEditSlotEntryId(null); setSelectedNewSlotId("") }}
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
