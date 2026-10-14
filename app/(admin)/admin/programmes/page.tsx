"use client"
/* eslint-disable react-hooks/incompatible-library -- react-hook-form's form.watch() is not yet annotated for React Compiler; behaviour is correct and Compiler already skips this component */

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { MoreHorizontal, BookOpen } from "lucide-react"
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

interface School {
  id: string
  name: string
}

interface Department {
  id: string
  name: string
  code: string
  schoolId: string
}

interface Programme {
  id: string
  name: string
  code: string
  departmentId: string
  department?: { name: string; code: string }
}

const programmeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be at most 100 characters"),
  code: z
    .string()
    .trim()
    .min(2, "Code must be at least 2 characters")
    .max(20, "Code must be at most 20 characters")
    .transform((v) => v.toUpperCase()),
  departmentId: z.string().min(1, "Department is required"),
})

type ProgrammeFormInput = z.input<typeof programmeSchema>
type ProgrammeFormValues = z.output<typeof programmeSchema>

const departmentsUrl = (schoolId?: string) =>
  schoolId ? `/api/departments?school_id=${encodeURIComponent(schoolId)}` : "/api/departments"

export default function ProgrammesPage() {
  const queryClient = useQueryClient()
  const [filterSchoolId, setFilterSchoolId] = useState<string>("all")
  const [filterDeptId, setFilterDeptId] = useState<string>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Programme | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Programme | null>(null)
  const [formSchoolId, setFormSchoolId] = useState<string>("")

  const { data: schools = [] } = useQuery<School[]>({
    queryKey: QUERY_KEYS.SCHOOLS,
    queryFn: () => apiGet<School[]>("/api/schools"),
  })

  const filterSchoolIdParam = filterSchoolId !== "all" ? filterSchoolId : undefined

  // Every department (used to find a programme's school when editing).
  const { data: allDepts = [] } = useQuery<Department[]>({
    queryKey: QUERY_KEYS.DEPARTMENTS(undefined),
    queryFn: () => apiGet<Department[]>(departmentsUrl()),
  })

  const { data: filterDepts = [] } = useQuery<Department[]>({
    queryKey: QUERY_KEYS.DEPARTMENTS(filterSchoolIdParam),
    queryFn: () => apiGet<Department[]>(departmentsUrl(filterSchoolIdParam)),
  })

  const { data: formDepts = [] } = useQuery<Department[]>({
    queryKey: QUERY_KEYS.DEPARTMENTS(formSchoolId || undefined),
    queryFn: () => apiGet<Department[]>(departmentsUrl(formSchoolId || undefined)),
    enabled: !!formSchoolId,
  })

  const deptIdParam = filterDeptId !== "all" ? filterDeptId : undefined

  const {
    data: programmes = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Programme[]>({
    queryKey: ["programmes", "list", filterSchoolIdParam, deptIdParam],
    queryFn: () => {
      const params = new URLSearchParams()
      if (filterSchoolIdParam) params.set("school_id", filterSchoolIdParam)
      if (deptIdParam) params.set("department_id", deptIdParam)
      const qs = params.toString()
      return apiGet<Programme[]>(qs ? `/api/programmes?${qs}` : "/api/programmes")
    },
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["programmes"] })
    queryClient.invalidateQueries({ queryKey: ["levels"] })
    queryClient.invalidateQueries({ queryKey: ["courses"] })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.STATS })
  }

  const form = useForm<ProgrammeFormInput, unknown, ProgrammeFormValues>({
    resolver: zodResolver(programmeSchema),
    defaultValues: { name: "", code: "", departmentId: "" },
  })

  const openCreate = () => {
    setEditTarget(null)
    setFormSchoolId("")
    form.reset({ name: "", code: "", departmentId: "" })
    setDialogOpen(true)
  }

  const openEdit = (programme: Programme) => {
    setEditTarget(programme)
    const dept = allDepts.find((d) => d.id === programme.departmentId)
    const schoolId = dept?.schoolId ?? ""
    setFormSchoolId(schoolId)
    form.reset({ name: programme.name, code: programme.code, departmentId: programme.departmentId })
    setDialogOpen(true)
  }

  const createMutation = useMutation({
    mutationFn: (body: ProgrammeFormValues) => apiSend<Programme>("/api/programmes", "POST", body),
    onSuccess: () => {
      invalidateAll()
      toast.success("Programme created")
      setDialogOpen(false)
      form.reset()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ProgrammeFormValues }) =>
      apiSend<Programme>(`/api/programmes/${id}`, "PUT", body),
    onSuccess: () => {
      invalidateAll()
      toast.success("Programme updated")
      setDialogOpen(false)
      setEditTarget(null)
      form.reset()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiSend(`/api/programmes/${id}`, "DELETE"),
    onSuccess: () => {
      invalidateAll()
      toast.success("Programme deleted")
      setDeleteTarget(null)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const onSubmit = (values: ProgrammeFormValues) => {
    if (editTarget) updateMutation.mutate({ id: editTarget.id, body: values })
    else createMutation.mutate(values)
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  /** "Computer Science (CSC)" — from the API include, falling back to the department list. */
  const getDeptLabel = (programme: Programme) => {
    const dept = programme.department ?? allDepts.find((d) => d.id === programme.departmentId)
    return dept ? `${dept.name} (${dept.code})` : "—"
  }

  const schoolLabel = (id: string) => schools.find((s) => s.id === id)?.name
  const deptLabel = (list: Department[], id: string) => {
    const d = list.find((x) => x.id === id)
    return d ? `${d.name} (${d.code})` : undefined
  }

  const columns: ColumnDef<Programme>[] = [
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
        <span className="text-muted-foreground">{row.original.code}</span>
      ),
    },
    {
      id: "department",
      header: "Department",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{getDeptLabel(row.original)}</span>
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
        title="Programmes"
        description="Manage programmes within departments"
        action={{ label: "Add Programme", onClick: openCreate }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={filterSchoolId}
          onValueChange={(v) => {
            if (v == null) return
            setFilterSchoolId(v)
            setFilterDeptId("all")
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filter by school">
              {filterSchoolId === "all" ? "All Schools" : (schoolLabel(filterSchoolId) ?? "School")}
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

        <Select value={filterDeptId} onValueChange={(v) => v != null && setFilterDeptId(v)}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Filter by department">
              {filterDeptId === "all"
                ? "All Departments"
                : (deptLabel(filterDepts, filterDeptId) ?? "Department")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {filterDepts.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name} ({d.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !isLoading && programmes.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No programmes found"
          description={
            filterSchoolId !== "all" || filterDeptId !== "all"
              ? "No programmes match these filters"
              : "Add your first programme to get started"
          }
          action={{ label: "Add Programme", onClick: openCreate }}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable columns={columns} data={programmes} isLoading={isLoading} />
          </div>
          <div className="md:hidden">
            <MobileCardList
              items={programmes}
              isLoading={isLoading}
              renderCard={(prog) => (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-foreground">{prog.name}</p>
                    <p className="text-sm text-muted-foreground">{prog.code}</p>
                    <p className="text-xs text-muted-foreground mt-1">{getDeptLabel(prog)}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground" />}>
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-foreground/70 focus:bg-muted"
                        onClick={() => openEdit(prog)}
                      >
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:bg-muted"
                        onClick={() => setDeleteTarget(prog)}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "Edit Programme" : "Add Programme"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-foreground/70">School</Label>
              <Select
                value={formSchoolId}
                onValueChange={(v) => {
                  if (v == null) return
                  setFormSchoolId(v)
                  form.setValue("departmentId", "", { shouldValidate: false })
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select school first">
                    {schoolLabel(formSchoolId) ?? "Select school first"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {schools.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-foreground/70">Department</Label>
              <Select
                value={form.watch("departmentId")}
                onValueChange={(v) => v != null && form.setValue("departmentId", v, { shouldValidate: true })}
                disabled={!formSchoolId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={formSchoolId ? "Select department" : "Select school first"}>
                    {deptLabel(formDepts, form.watch("departmentId")) ??
                      (formSchoolId ? "Select department" : "Select school first")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {formDepts.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.departmentId && (
                <p className="text-sm text-destructive">{form.formState.errors.departmentId.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-foreground/70">Name</Label>
              <Input placeholder="e.g. National Diploma (ND)" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-foreground/70">Code</Label>
              <Input placeholder="e.g. ND" className="uppercase" {...form.register("code")} />
              {form.formState.errors.code && (
                <p className="text-sm text-destructive">{form.formState.errors.code.message}</p>
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
        title="Delete Programme"
        description={`Delete "${deleteTarget?.name}"? Its levels and courses are deleted with it. A programme with registered students cannot be deleted. This action cannot be undone.`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
