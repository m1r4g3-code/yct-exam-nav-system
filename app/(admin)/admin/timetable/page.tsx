"use client"

import { useState, useMemo } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CalendarRange, RefreshCw, Send, Trash2, Plus, Users } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"

import { QUERY_KEYS } from "@/lib/query-keys"
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
}

function nextMonday(): string {
  const today = new Date()
  const day = today.getDay()
  const daysToMonday = day === 0 ? 1 : day === 1 ? 7 : 8 - day
  const d = new Date(today)
  d.setDate(today.getDate() + daysToMonday)
  return d.toISOString().split("T")[0]
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

export default function TimetablePage() {
  const queryClient = useQueryClient()

  const [session, setSession] = useState<string>("")
  const [activeTab, setActiveTab] = useState<string>("all")

  const [generateDialogOpen, setGenerateDialogOpen] = useState(false)
  const [generateSchoolId, setGenerateSchoolId] = useState<string>("all")
  const [generateExamStartDate, setGenerateExamStartDate] = useState<string>(nextMonday)

  const [generateResultOpen, setGenerateResultOpen] = useState(false)
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null)

  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)

  const [editSlotEntryId, setEditSlotEntryId] = useState<string | null>(null)
  const [selectedNewSlotId, setSelectedNewSlotId] = useState<string>("")

  const [newSessionDialogOpen, setNewSessionDialogOpen] = useState(false)
  const [newSessionName, setNewSessionName] = useState("")

  const [assignmentsDialogOpen, setAssignmentsDialogOpen] = useState(false)

  const { data: sessions = [] } = useQuery<SessionOption[]>({
    queryKey: QUERY_KEYS.SESSIONS,
    queryFn: async () => {
      const res = await fetch("/api/sessions")
      const json = await res.json()
      return json.data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: schools = [] } = useQuery<School[]>({
    queryKey: QUERY_KEYS.SCHOOLS,
    queryFn: async () => {
      const res = await fetch("/api/schools")
      const json = await res.json()
      return json.data ?? []
    },
    staleTime: 60 * 60 * 1000,
  })

  const { data: slots = [] } = useQuery<TimeSlotOption[]>({
    queryKey: QUERY_KEYS.SLOTS,
    queryFn: async () => {
      const res = await fetch("/api/slots")
      const json = await res.json()
      return json.data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: entries = [], isLoading } = useQuery<TimetableEntry[]>({
    queryKey: QUERY_KEYS.TIMETABLE(session || undefined),
    queryFn: async () => {
      if (!session) return []
      const res = await fetch(`/api/timetable?session=${encodeURIComponent(session)}`)
      const json = await res.json()
      return json.data ?? []
    },
    enabled: !!session,
  })

  const hasDraft = entries.some((e) => e.status === "DRAFT")

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

  const generateMutation = useMutation({
    mutationFn: async (params: { force: boolean; schoolId?: string; examStartDate?: string }) => {
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
      const res = await fetch(`/api/timetable/${encodeURIComponent(session)}/publish`, { method: "PUT" })
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
      // ?confirm=published bypasses the published-entries guard — the ConfirmDialog
      // already presents an explicit "delete draft AND published" warning.
      const res = await fetch(
        `/api/timetable/${encodeURIComponent(session)}/reset?confirm=published`,
        { method: "DELETE" }
      )
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

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery<SeatAssignment[]>({
    queryKey: ["assignments", session],
    queryFn: async () => {
      const res = await fetch(`/api/assignments?session=${encodeURIComponent(session)}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
      return json.data ?? []
    },
    enabled: assignmentsDialogOpen && !!session,
    staleTime: 60 * 1000,
  })

  const createSessionMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
      return json.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SESSIONS })
      setSession(data.name)
      setNewSessionName("")
      setNewSessionDialogOpen(false)
      toast.success(`Session "${data.name}" created`)
    },
    onError: (e: Error) => toast.error(e.message),
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
      cell: ({ row }) => (
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

          {entries.some((e) => e.status === "PUBLISHED") && (
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

      <div className="flex items-center gap-2">
        <Select value={session} onValueChange={(v) => { if (v != null) { setSession(v); setActiveTab("all") } }}>
          <SelectTrigger className="w-64">
            <SelectValue>{session || "Select session"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {sessions.filter((s) => s.isActive).map((s) => (
              <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => setNewSessionDialogOpen(true)} title="Create new session">
          <Plus className="size-4" />
        </Button>
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
              The system will automatically create exam slots and assign courses using DSatur graph
              coloring. Existing draft entries for{" "}
              <span className="text-foreground font-medium">&ldquo;{session}&rdquo;</span> will be replaced.
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
              <p className="text-xs text-muted-foreground">Filter to one school or generate for all at once</p>
            </div>

            <div className="space-y-1.5">
              <Label>Exam Start Date</Label>
              <Input
                type="date"
                value={generateExamStartDate}
                onChange={(e) => setGenerateExamStartDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Mon–Fri slots (8:00 AM–10:00 AM and 12:00 PM–2:00 PM) auto-created for 2 weeks from this date
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateDialogOpen(false)} disabled={generateMutation.isPending}>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Generation Complete</DialogTitle>
            <DialogDescription>Timetable generation finished for {session}.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-sm text-foreground">
              <span className="font-medium text-emerald-600 dark:text-emerald-400">{generateResult?.assigned ?? 0}</span>{" "}
              courses assigned successfully.
            </p>

            {(generateResult?.unresolved?.length ?? 0) > 0 && (
              <div>
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-1">
                  Unresolved ({generateResult!.unresolved.length})
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
        description={`Publish all draft entries for "${session}"? Students will be able to view their exam schedule.`}
        onConfirm={() => publishMutation.mutate()}
        loading={publishMutation.isPending}
      />

      <ConfirmDialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        title="Reset Timetable"
        description={`Delete ALL timetable entries (draft and published) for "${session}"? This cannot be undone. You will need to regenerate and republish.`}
        onConfirm={() => resetMutation.mutate()}
        loading={resetMutation.isPending}
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
              <p className="text-sm text-muted-foreground py-8 text-center">No seat assignments found for this session.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background border-b border-border">
                  <tr className="text-left">
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Matric No.</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Student</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Course</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Date</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Hall</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Seat</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => (
                    <tr key={a.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{a.student.matricNumber}</td>
                      <td className="py-2 pr-4 text-foreground/80">{a.student.fullName}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-foreground">{a.timetableEntry.course.code}</td>
                      <td className="py-2 pr-4 text-muted-foreground text-xs">{formatDate(a.timetableEntry.timeSlot.date)}</td>
                      <td className="py-2 pr-4 text-muted-foreground text-xs">{a.examHall.code}</td>
                      <td className="py-2 font-mono text-xs text-right tabular-nums">{a.seatNumber ?? "—"}</td>
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
      <Dialog open={newSessionDialogOpen} onOpenChange={(v) => { setNewSessionDialogOpen(v); if (!v) setNewSessionName("") }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Academic Session</DialogTitle>
            <DialogDescription>
              Format: <span className="font-mono text-foreground">YYYY/YYYY First Semester</span> or <span className="font-mono text-foreground">YYYY/YYYY Second Semester</span>
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label>Session name</Label>
            <Input
              className="mt-1.5"
              placeholder="e.g. 2025/2026 First Semester"
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newSessionName.trim() && !createSessionMutation.isPending)
                  createSessionMutation.mutate(newSessionName.trim())
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewSessionDialogOpen(false); setNewSessionName("") }} disabled={createSessionMutation.isPending}>
              Cancel
            </Button>
            <Button
              disabled={!newSessionName.trim() || createSessionMutation.isPending}
              onClick={() => createSessionMutation.mutate(newSessionName.trim())}
            >
              {createSessionMutation.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Select Time Slot</Label>
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
