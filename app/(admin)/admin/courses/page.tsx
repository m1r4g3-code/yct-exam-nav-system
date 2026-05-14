"use client"

import { useState, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { MoreHorizontal, GraduationCap, Upload } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"

import { QUERY_KEYS } from "@/lib/query-keys"
import { DataTable } from "@/components/admin/data-table"
import { MobileCardList } from "@/components/admin/mobile-card-list"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { EmptyState } from "@/components/admin/empty-state"
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

interface School { id: string; name: string }
interface Department { id: string; name: string; schoolId: string }
interface Programme { id: string; name: string; departmentId: string }
interface Level { id: string; name: string; programmeId: string }

interface Course {
  id: string
  code: string
  title: string
  creditUnits: number
  semester: "FIRST" | "SECOND"
  levelId: string
  level?: { name: string }
}

const courseSchema = z.object({
  code: z.string().min(1, "Code is required"),
  title: z.string().min(1, "Title is required"),
  creditUnits: z.number().int().min(1),
  semester: z.enum(["FIRST", "SECOND"]),
  levelId: z.string().min(1, "Level is required"),
})

type CourseFormValues = z.infer<typeof courseSchema>

export default function CoursesPage() {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [filterSchoolId, setFilterSchoolId] = useState<string>("all")
  const [filterDeptId, setFilterDeptId] = useState<string>("all")
  const [filterProgId, setFilterProgId] = useState<string>("all")
  const [filterLevelId, setFilterLevelId] = useState<string>("all")

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Course | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null)

  const [formSchoolId, setFormSchoolId] = useState<string>("")
  const [formDeptId, setFormDeptId] = useState<string>("")
  const [formProgId, setFormProgId] = useState<string>("")

  const { data: schools = [] } = useQuery<School[]>({
    queryKey: QUERY_KEYS.SCHOOLS,
    queryFn: async () => {
      const res = await fetch("/api/schools")
      const json = await res.json()
      return json.data ?? []
    },
  })

  const { data: filterDepts = [] } = useQuery<Department[]>({
    queryKey: QUERY_KEYS.DEPARTMENTS(filterSchoolId !== "all" ? filterSchoolId : undefined),
    queryFn: async () => {
      const url = filterSchoolId !== "all" ? `/api/departments?school_id=${filterSchoolId}` : "/api/departments"
      const res = await fetch(url)
      const json = await res.json()
      return json.data ?? []
    },
  })

  const { data: filterProgs = [] } = useQuery<Programme[]>({
    queryKey: QUERY_KEYS.PROGRAMMES(filterDeptId !== "all" ? filterDeptId : undefined),
    queryFn: async () => {
      const url = filterDeptId !== "all" ? `/api/programmes?department_id=${filterDeptId}` : "/api/programmes"
      const res = await fetch(url)
      const json = await res.json()
      return json.data ?? []
    },
  })

  const { data: filterLevels = [] } = useQuery<Level[]>({
    queryKey: QUERY_KEYS.LEVELS(filterProgId !== "all" ? filterProgId : undefined),
    queryFn: async () => {
      const url = filterProgId !== "all" ? `/api/levels?programme_id=${filterProgId}` : "/api/levels"
      const res = await fetch(url)
      const json = await res.json()
      return json.data ?? []
    },
  })

  const deptIdParam = filterDeptId !== "all" ? filterDeptId : undefined
  const levelIdParam = filterLevelId !== "all" ? filterLevelId : undefined

  const { data: courses = [], isLoading } = useQuery<Course[]>({
    queryKey: ["courses", { level: levelIdParam, dept: deptIdParam }],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (levelIdParam) params.set("level_id", levelIdParam)
      else if (deptIdParam) params.set("department_id", deptIdParam)
      const url = params.size ? `/api/courses?${params}` : "/api/courses"
      const res = await fetch(url)
      const json = await res.json()
      return json.data ?? []
    },
  })

  // Form cascade queries
  const { data: formDepts = [] } = useQuery<Department[]>({
    queryKey: QUERY_KEYS.DEPARTMENTS(formSchoolId || undefined),
    queryFn: async () => {
      const url = formSchoolId ? `/api/departments?school_id=${formSchoolId}` : "/api/departments"
      const res = await fetch(url)
      const json = await res.json()
      return json.data ?? []
    },
  })

  const { data: formProgs = [] } = useQuery<Programme[]>({
    queryKey: QUERY_KEYS.PROGRAMMES(formDeptId || undefined),
    queryFn: async () => {
      const url = formDeptId ? `/api/programmes?department_id=${formDeptId}` : "/api/programmes"
      const res = await fetch(url)
      const json = await res.json()
      return json.data ?? []
    },
  })

  const { data: formLevels = [] } = useQuery<Level[]>({
    queryKey: QUERY_KEYS.LEVELS(formProgId || undefined),
    queryFn: async () => {
      const url = formProgId ? `/api/levels?programme_id=${formProgId}` : "/api/levels"
      const res = await fetch(url)
      const json = await res.json()
      return json.data ?? []
    },
  })

  const form = useForm<CourseFormValues>({
    resolver: zodResolver(courseSchema),
    defaultValues: { code: "", title: "", creditUnits: 2, semester: "FIRST", levelId: "" },
  })

  const openCreate = () => {
    setEditTarget(null)
    setFormSchoolId("")
    setFormDeptId("")
    setFormProgId("")
    form.reset({ code: "", title: "", creditUnits: 2, semester: "FIRST", levelId: "" })
    setDialogOpen(true)
  }

  const openEdit = (course: Course) => {
    setEditTarget(course)
    form.reset({
      code: course.code,
      title: course.title,
      creditUnits: course.creditUnits,
      semester: course.semester,
      levelId: course.levelId,
    })
    setDialogOpen(true)
  }

  async function fetchCourse(url: string, method: string, body: CourseFormValues) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!json.success) {
      const fieldErrors: { field: string; message: string }[] = json.errors ?? []
      const detail = fieldErrors.length
        ? fieldErrors.map((e) => `${e.field}: ${e.message}`).join(", ")
        : json.message
      throw new Error(detail)
    }
    return json.data
  }

  const createMutation = useMutation({
    mutationFn: (body: CourseFormValues) => fetchCourse("/api/courses", "POST", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] })
      toast.success("Course created")
      setDialogOpen(false)
      form.reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: (body: CourseFormValues) => fetchCourse(`/api/courses/${editTarget!.id}`, "PUT", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] })
      toast.success("Course updated")
      setDialogOpen(false)
      setEditTarget(null)
      form.reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/courses/${id}`, { method: "DELETE" })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] })
      toast.success("Course deleted")
      setDeleteTarget(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/courses/upload-csv", {
        method: "POST",
        body: formData,
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
      return json.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["courses"] })
      toast.success(`Imported: ${data?.imported ?? 0}, Skipped: ${data?.skipped ?? 0}`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const onSubmit = (values: CourseFormValues) => {
    if (!values.levelId) {
      form.setError("levelId", { message: "Please select a level" })
      return
    }
    if (editTarget) updateMutation.mutate(values)
    else createMutation.mutate(values)
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

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
        <span className="text-foreground/70">{row.original.title}</span>
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
      cell: ({ row }) => (
        <Badge
          className={
            row.original.semester === "FIRST"
              ? "border-blue-500/30 bg-blue-500/15 text-blue-400"
              : "border-purple-500/30 bg-purple-500/15 text-purple-400"
          }
        >
          {row.original.semester === "FIRST" ? "First" : "Second"}
        </Badge>
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
      <div className="flex flex-row items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Courses</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Manage courses within levels</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploadMutation.isPending}>
            <Upload className="mr-1.5 size-4" />
            {uploadMutation.isPending ? "Uploading…" : "Upload CSV"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
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
        <Select value={filterSchoolId} onValueChange={(v) => { if (v == null) return; setFilterSchoolId(v); setFilterDeptId("all"); setFilterProgId("all"); setFilterLevelId("all") }}>
          <SelectTrigger className="w-44">
            <SelectValue>
              {filterSchoolId === "all" ? "All Schools" : (schools.find(s => s.id === filterSchoolId)?.name ?? "School")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Schools</SelectItem>
            {schools.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterDeptId} onValueChange={(v) => { if (v == null) return; setFilterDeptId(v); setFilterProgId("all"); setFilterLevelId("all") }}>
          <SelectTrigger className="w-44">
            <SelectValue>
              {filterDeptId === "all" ? "All Departments" : (filterDepts.find(d => d.id === filterDeptId)?.name ?? "Department")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {filterDepts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select
          value={filterProgId}
          onValueChange={(v) => { if (v == null) return; setFilterProgId(v); setFilterLevelId("all") }}
          disabled={filterDeptId === "all"}
        >
          <SelectTrigger className="w-44">
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
          onValueChange={(v) => v != null && setFilterLevelId(v)}
          disabled={filterProgId === "all"}
        >
          <SelectTrigger className="w-44">
            <SelectValue>
              {filterLevelId === "all" ? "All Levels" : (filterLevels.find(l => l.id === filterLevelId)?.name ?? "Level")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            {filterLevels.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!isLoading && courses.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No courses found"
          description="Add or upload courses to get started"
          action={{ label: "Add Course", onClick: openCreate }}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable columns={columns} data={courses} isLoading={isLoading} />
          </div>
          <div className="md:hidden">
            <MobileCardList
              items={courses}
              isLoading={isLoading}
              renderCard={(course) => (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-mono text-sm font-medium text-foreground">{course.code}</p>
                    <p className="text-sm text-foreground/70">{course.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {course.creditUnits} credits · {course.semester === "FIRST" ? "First" : "Second"} Semester
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
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Course" : "Add Course"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Cascade selects for level */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-foreground/70">School</Label>
                <Select value={formSchoolId} onValueChange={(v) => { if (v == null) return; setFormSchoolId(v); setFormDeptId(""); setFormProgId(""); form.setValue("levelId", "") }}>
                  <SelectTrigger>
                    <SelectValue>
                      {formSchoolId ? (schools.find(s => s.id === formSchoolId)?.name ?? "School") : "School"}
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
                  <SelectTrigger>
                    <SelectValue>
                      {formDeptId ? (formDepts.find(d => d.id === formDeptId)?.name ?? "Department") : "Department"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {formDepts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-foreground/70">Programme</Label>
                <Select value={formProgId} onValueChange={(v) => { if (v == null) return; setFormProgId(v); form.setValue("levelId", "") }} disabled={!formDeptId}>
                  <SelectTrigger>
                    <SelectValue>
                      {formProgId ? (formProgs.find(p => p.id === formProgId)?.name ?? "Programme") : "Programme"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {formProgs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-foreground/70">Level</Label>
                <Select value={form.watch("levelId")} onValueChange={(v) => v != null && form.setValue("levelId", v, { shouldValidate: true })} disabled={!formProgId}>
                  <SelectTrigger>
                    <SelectValue>
                      {form.watch("levelId") ? (formLevels.find(l => l.id === form.watch("levelId"))?.name ?? "Level") : "Level"}
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
              <Input placeholder="e.g. CSC 201" {...form.register("code")} />
              {form.formState.errors.code && <p className="text-sm text-destructive">{form.formState.errors.code.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-foreground/70">Title</Label>
              <Input placeholder="e.g. Data Structures and Algorithms" {...form.register("title")} />
              {form.formState.errors.title && <p className="text-sm text-destructive">{form.formState.errors.title.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-foreground/70">Credit Units</Label>
                <Input type="number" min={1} {...form.register("creditUnits", { valueAsNumber: true })} />
                {form.formState.errors.creditUnits && <p className="text-sm text-destructive">{form.formState.errors.creditUnits.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-foreground/70">Semester</Label>
                <Select value={form.watch("semester")} onValueChange={(v) => form.setValue("semester", v as "FIRST" | "SECOND", { shouldValidate: true })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIRST">First</SelectItem>
                    <SelectItem value="SECOND">Second</SelectItem>
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
        description={`Are you sure you want to delete "${deleteTarget?.title}"? This action cannot be undone.`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
