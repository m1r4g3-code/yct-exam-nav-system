"use client"
/* eslint-disable react-hooks/incompatible-library -- react-hook-form's form.watch() is not yet annotated for React Compiler; behaviour is correct and Compiler already skips this component */

import { useEffect, useRef, useState } from "react"
import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { MoreHorizontal, GraduationCap, Upload, Search } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"

import { QUERY_KEYS } from "@/lib/query-keys"
import { apiGet, apiGetPage, apiSend, apiUpload, errorMessage } from "@/lib/fetcher"
import { DataTable } from "@/components/admin/data-table"
import { MobileCardList } from "@/components/admin/mobile-card-list"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { EmptyState } from "@/components/admin/empty-state"
import { ErrorState } from "@/components/admin/error-state"
import { ImportReportDialog, type ImportReport } from "@/components/admin/import-report-dialog"
import { Badge } from "@/components/ui/badge"
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

interface School { id: string; name: string; code: string }
interface Department { id: string; name: string; code: string; schoolId: string }
interface Programme { id: string; name: string; code: string; departmentId: string }
interface Level { id: string; name: string; year: number; programmeId: string }

type Semester = "FIRST" | "SECOND"

interface Course {
  id: string
  code: string
  title: string
  creditUnits: number
  semester: Semester
  levelId: string
  level?: {
    id: string
    name: string
    year: number
    programme: {
      id: string
      name: string
      code: string
      department: { id: string; name: string; code: string; schoolId: string }
    }
  }
}

interface CourseImportReport extends ImportReport {
  updated: number
}

const PAGE_SIZE = 50

const SEMESTER_LABEL: Record<Semester, string> = {
  FIRST: "First Semester",
  SECOND: "Second Semester",
}

const courseSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Code must be at least 2 characters")
    .max(20, "Code must be at most 20 characters")
    .transform((v) => v.toUpperCase()),
  title: z
    .string()
    .trim()
    .min(2, "Title must be at least 2 characters")
    .max(255, "Title must be at most 255 characters"),
  creditUnits: z
    .number({ error: "Credit units must be a whole number from 1 to 6" })
    .int("Credit units must be a whole number from 1 to 6")
    .min(1, "Credit units must be from 1 to 6")
    .max(6, "Credit units must be from 1 to 6"),
  semester: z.enum(["FIRST", "SECOND"]),
  levelId: z.string().min(1, "Please select a level"),
})

type CourseFormInput = z.input<typeof courseSchema>
type CourseFormValues = z.output<typeof courseSchema>

const EMPTY_COURSE: CourseFormInput = { code: "", title: "", creditUnits: 2, semester: "FIRST", levelId: "" }

/** "ND 1 · CSC" */
function levelLabel(course: Course): string {
  if (!course.level) return "—"
  const dept = course.level.programme?.department?.code
  return dept ? `${course.level.name} · ${dept}` : course.level.name
}

const departmentsUrl = (schoolId?: string) =>
  schoolId ? `/api/departments?school_id=${encodeURIComponent(schoolId)}` : "/api/departments"
const programmesUrl = (departmentId: string) =>
  `/api/programmes?department_id=${encodeURIComponent(departmentId)}`
const levelsUrl = (programmeId: string) => `/api/levels?programme_id=${encodeURIComponent(programmeId)}`

function SemesterBadge({ semester }: { semester: Semester }) {
  return (
    <Badge
      className={
        semester === "FIRST"
          ? "border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-400"
          : "border-purple-500/30 bg-purple-500/15 text-purple-700 dark:text-purple-400"
      }
    >
      {semester === "FIRST" ? "First" : "Second"}
    </Badge>
  )
}

export default function CoursesPage() {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [filterSchoolId, setFilterSchoolId] = useState<string>("all")
  const [filterDeptId, setFilterDeptId] = useState<string>("all")
  const [filterProgId, setFilterProgId] = useState<string>("all")
  const [filterLevelId, setFilterLevelId] = useState<string>("all")
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Course | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null)
  const [importReport, setImportReport] = useState<CourseImportReport | null>(null)

  const [formSchoolId, setFormSchoolId] = useState<string>("")
  const [formDeptId, setFormDeptId] = useState<string>("")
  const [formProgId, setFormProgId] = useState<string>("")

  // Wait for a pause in typing before searching, and start again from page 1.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const { data: schools = [] } = useQuery<School[]>({
    queryKey: QUERY_KEYS.SCHOOLS,
    queryFn: () => apiGet<School[]>("/api/schools"),
  })

  const schoolIdParam = filterSchoolId !== "all" ? filterSchoolId : undefined
  const deptIdParam = filterDeptId !== "all" ? filterDeptId : undefined
  const progIdParam = filterProgId !== "all" ? filterProgId : undefined
  const levelIdParam = filterLevelId !== "all" ? filterLevelId : undefined

  const { data: filterDepts = [] } = useQuery<Department[]>({
    queryKey: QUERY_KEYS.DEPARTMENTS(schoolIdParam),
    queryFn: () => apiGet<Department[]>(departmentsUrl(schoolIdParam)),
  })

  const { data: filterProgs = [] } = useQuery<Programme[]>({
    queryKey: QUERY_KEYS.PROGRAMMES(deptIdParam),
    queryFn: () => apiGet<Programme[]>(programmesUrl(deptIdParam!)),
    enabled: !!deptIdParam,
  })

  const { data: filterLevels = [] } = useQuery<Level[]>({
    queryKey: QUERY_KEYS.LEVELS(progIdParam),
    queryFn: () => apiGet<Level[]>(levelsUrl(progIdParam!)),
    enabled: !!progIdParam,
  })

  const {
    data: coursePage,
    isLoading,
    isError,
    error,
    refetch,
    isPlaceholderData,
  } = useQuery({
    queryKey: [
      "courses",
      "list",
      { school: schoolIdParam, dept: deptIdParam, prog: progIdParam, level: levelIdParam, search, page },
    ],
    queryFn: () => {
      const params = new URLSearchParams()
      // The most specific filter wins (a level implies its programme, department and school).
      if (levelIdParam) params.set("level_id", levelIdParam)
      else if (progIdParam) params.set("programme_id", progIdParam)
      else if (deptIdParam) params.set("department_id", deptIdParam)
      else if (schoolIdParam) params.set("school_id", schoolIdParam)
      if (search) params.set("search", search)
      params.set("page", String(page))
      params.set("limit", String(PAGE_SIZE))
      return apiGetPage<Course[]>(`/api/courses?${params}`)
    },
    placeholderData: keepPreviousData,
  })

  const courses = coursePage?.data ?? []
  const total = coursePage?.meta?.total ?? courses.length
  const pages = Math.max(1, coursePage?.meta?.pages ?? 1)
  const hasFilters = !!(schoolIdParam || deptIdParam || progIdParam || levelIdParam || search)

  // Form cascade queries
  const { data: formDepts = [] } = useQuery<Department[]>({
    queryKey: QUERY_KEYS.DEPARTMENTS(formSchoolId || undefined),
    queryFn: () => apiGet<Department[]>(departmentsUrl(formSchoolId)),
    enabled: !!formSchoolId,
  })

  const { data: formProgs = [] } = useQuery<Programme[]>({
    queryKey: QUERY_KEYS.PROGRAMMES(formDeptId || undefined),
    queryFn: () => apiGet<Programme[]>(programmesUrl(formDeptId)),
    enabled: !!formDeptId,
  })

  const { data: formLevels = [] } = useQuery<Level[]>({
    queryKey: QUERY_KEYS.LEVELS(formProgId || undefined),
    queryFn: () => apiGet<Level[]>(levelsUrl(formProgId)),
    enabled: !!formProgId,
  })

  const form = useForm<CourseFormInput, unknown, CourseFormValues>({
    resolver: zodResolver(courseSchema),
    defaultValues: EMPTY_COURSE,
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["courses"] })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.STATS })
  }

  const openCreate = () => {
    setEditTarget(null)
    setFormSchoolId("")
    setFormDeptId("")
    setFormProgId("")
    form.reset(EMPTY_COURSE)
    setDialogOpen(true)
  }

  const openEdit = (course: Course) => {
    setEditTarget(course)
    // Pre-fill the School → Department → Programme → Level chain from the course's level.
    const programme = course.level?.programme
    setFormSchoolId(programme?.department.schoolId ?? "")
    setFormDeptId(programme?.department.id ?? "")
    setFormProgId(programme?.id ?? "")
    form.reset({
      code: course.code,
      title: course.title,
      creditUnits: course.creditUnits,
      semester: course.semester,
      levelId: course.levelId,
    })
    setDialogOpen(true)
  }

  const createMutation = useMutation({
    mutationFn: (body: CourseFormValues) => apiSend<Course>("/api/courses", "POST", body),
    onSuccess: () => {
      invalidateAll()
      toast.success("Course created")
      setDialogOpen(false)
      form.reset(EMPTY_COURSE)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: CourseFormValues }) =>
      apiSend<Course>(`/api/courses/${id}`, "PUT", body),
    onSuccess: () => {
      invalidateAll()
      toast.success("Course updated")
      setDialogOpen(false)
      setEditTarget(null)
      form.reset(EMPTY_COURSE)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiSend(`/api/courses/${id}`, "DELETE"),
    onSuccess: () => {
      // Deleting the only course on the last page: step back so the list isn't empty.
      if (courses.length === 1 && page > 1) setPage(page - 1)
      invalidateAll()
      toast.success("Course deleted")
      setDeleteTarget(null)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append("file", file)
      return apiUpload<CourseImportReport>("/api/courses/upload-csv", formData)
    },
    onSuccess: ({ data }) => {
      invalidateAll()
      setImportReport({
        imported: data?.imported ?? 0,
        updated: data?.updated ?? 0,
        skipped: data?.skipped ?? 0,
        errors: data?.errors ?? [],
      })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const onSubmit = (values: CourseFormValues) => {
    if (editTarget) updateMutation.mutate({ id: editTarget.id, body: values })
    else createMutation.mutate(values)
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  const deptLabel = (d: Department) => `${d.name} (${d.code})`
  const formLevelId = form.watch("levelId")
  const formSemester = form.watch("semester")

  const columns: ColumnDef<Course>[] = [
    {
      accessorKey: "code",
      header: "Code",
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium text-foreground">{row.original.code}</span>
      ),
    },
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <span className="text-foreground/80">{row.original.title}</span>
      ),
    },
    {
      id: "level",
      header: "Level",
      accessorFn: (course) => levelLabel(course),
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">{levelLabel(row.original)}</span>
      ),
    },
    {
      accessorKey: "creditUnits",
      header: "Credits",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.creditUnits}</span>
      ),
    },
    {
      accessorKey: "semester",
      header: "Semester",
      cell: ({ row }) => <SemesterBadge semester={row.original.semester} />,
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Courses</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            CSV columns:{" "}
            <code className="font-mono text-xs">
              course_code,course_title,department_code,level_name,credit_units,semester
            </code>{" "}
            (existing codes are updated)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploadMutation.isPending}>
            <Upload className="mr-1.5 size-4" />
            {uploadMutation.isPending ? "Uploading…" : "Upload CSV"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                uploadMutation.mutate(file)
                e.target.value = ""
              }
            }}
          />
          <Button onClick={openCreate}>Add Course</Button>
        </div>
      </div>

      {/* Cascade filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterSchoolId} onValueChange={(v) => { if (v == null) return; setFilterSchoolId(v); setFilterDeptId("all"); setFilterProgId("all"); setFilterLevelId("all"); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue>
              {filterSchoolId === "all" ? "All Schools" : (schools.find(s => s.id === filterSchoolId)?.name ?? "School")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Schools</SelectItem>
            {schools.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterDeptId} onValueChange={(v) => { if (v == null) return; setFilterDeptId(v); setFilterProgId("all"); setFilterLevelId("all"); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue>
              {filterDeptId === "all"
                ? "All Departments"
                : (() => {
                    const d = filterDepts.find((x) => x.id === filterDeptId)
                    return d ? deptLabel(d) : "Department"
                  })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {filterDepts.map((d) => <SelectItem key={d.id} value={d.id}>{deptLabel(d)}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select
          value={filterProgId}
          onValueChange={(v) => { if (v == null) return; setFilterProgId(v); setFilterLevelId("all"); setPage(1) }}
          disabled={filterDeptId === "all"}
        >
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue>
              {filterProgId === "all" ? "All Programmes" : (filterProgs.find(p => p.id === filterProgId)?.name ?? "Programme")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Programmes</SelectItem>
            {filterProgs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select
          value={filterLevelId}
          onValueChange={(v) => { if (v == null) return; setFilterLevelId(v); setPage(1) }}
          disabled={filterProgId === "all"}
        >
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue>
              {filterLevelId === "all" ? "All Levels" : (filterLevels.find(l => l.id === filterLevelId)?.name ?? "Level")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            {filterLevels.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search code or title"
            className="pl-8"
            aria-label="Search courses by code or title"
          />
        </div>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !isLoading && courses.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No courses found"
          description={hasFilters ? "No courses match these filters" : "Add or upload courses to get started"}
          action={{ label: "Add Course", onClick: openCreate }}
        />
      ) : (
        <>
          <div className={`hidden md:block ${isPlaceholderData ? "opacity-60" : ""}`}>
            <DataTable columns={columns} data={courses} isLoading={isLoading} />
          </div>
          <div className={`md:hidden ${isPlaceholderData ? "opacity-60" : ""}`}>
            <MobileCardList
              items={courses}
              isLoading={isLoading}
              renderCard={(course) => (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-mono text-sm font-medium text-foreground">{course.code}</p>
                    <p className="text-sm text-foreground/80">{course.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {levelLabel(course)} · {course.creditUnits} credits · {SEMESTER_LABEL[course.semester]}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground" />}>
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="text-foreground/70 focus:bg-muted" onClick={() => openEdit(course)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:bg-muted" onClick={() => setDeleteTarget(course)}>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            />
          </div>

          {!isLoading && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Page {Math.min(page, pages)} of {pages} · {total.toLocaleString()} course{total === 1 ? "" : "s"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || isPlaceholderData}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= pages || isPlaceholderData}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Course" : "Add Course"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Cascade selects for level */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-foreground/70">School</Label>
                <Select value={formSchoolId} onValueChange={(v) => { if (v == null) return; setFormSchoolId(v); setFormDeptId(""); setFormProgId(""); form.setValue("levelId", "") }}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {formSchoolId ? (schools.find(s => s.id === formSchoolId)?.name ?? "School") : "Select school"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {schools.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-foreground/70">Department</Label>
                <Select value={formDeptId} onValueChange={(v) => { if (v == null) return; setFormDeptId(v); setFormProgId(""); form.setValue("levelId", "") }} disabled={!formSchoolId}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {formDeptId
                        ? (() => {
                            const d = formDepts.find((x) => x.id === formDeptId)
                            return d ? deptLabel(d) : "Department"
                          })()
                        : "Select department"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {formDepts.map((d) => <SelectItem key={d.id} value={d.id}>{deptLabel(d)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-foreground/70">Programme</Label>
                <Select value={formProgId} onValueChange={(v) => { if (v == null) return; setFormProgId(v); form.setValue("levelId", "") }} disabled={!formDeptId}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {formProgId ? (formProgs.find(p => p.id === formProgId)?.name ?? "Programme") : "Select programme"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {formProgs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-foreground/70">Level</Label>
                <Select value={formLevelId} onValueChange={(v) => v != null && form.setValue("levelId", v, { shouldValidate: true })} disabled={!formProgId}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {formLevelId
                        ? (formLevels.find(l => l.id === formLevelId)?.name ?? editTarget?.level?.name ?? "Level")
                        : "Select level"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {formLevels.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.formState.errors.levelId && (
                  <p className="text-sm text-destructive">{form.formState.errors.levelId.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-foreground/70">Course Code</Label>
              <Input placeholder="e.g. COM 211" className="uppercase" {...form.register("code")} />
              {form.formState.errors.code && <p className="text-sm text-destructive">{form.formState.errors.code.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-foreground/70">Title</Label>
              <Input placeholder="e.g. Data Structures and Algorithms" {...form.register("title")} />
              {form.formState.errors.title && <p className="text-sm text-destructive">{form.formState.errors.title.message}</p>}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-foreground/70">Credit Units (1–6)</Label>
                <Input type="number" min={1} max={6} {...form.register("creditUnits", { valueAsNumber: true })} />
                {form.formState.errors.creditUnits && <p className="text-sm text-destructive">{form.formState.errors.creditUnits.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-foreground/70">Semester</Label>
                <Select value={formSemester} onValueChange={(v) => v != null && form.setValue("semester", v as Semester, { shouldValidate: true })}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{SEMESTER_LABEL[formSemester]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIRST">First Semester</SelectItem>
                    <SelectItem value="SECOND">Second Semester</SelectItem>
                  </SelectContent>
                </Select>
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
        title="Delete Course"
        description={`Delete ${deleteTarget?.code} — "${deleteTarget?.title}"? A course that is on a published timetable or has enrolled students cannot be deleted. This action cannot be undone.`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
      />

      <ImportReportDialog
        report={importReport}
        onOpenChange={(open) => !open && setImportReport(null)}
        title="Course import report"
      />
    </div>
  )
}
