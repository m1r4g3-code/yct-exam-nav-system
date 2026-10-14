"use client"
/* eslint-disable react-hooks/incompatible-library -- react-hook-form's form.watch() is not yet annotated for React Compiler; behaviour is correct and Compiler already skips this component */

import { useState, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { MoreHorizontal, Building, Upload } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"

import { QUERY_KEYS } from "@/lib/query-keys"
import { apiGet, apiSend, apiUpload, errorMessage } from "@/lib/fetcher"
import { DataTable } from "@/components/admin/data-table"
import { MobileCardList } from "@/components/admin/mobile-card-list"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { EmptyState } from "@/components/admin/empty-state"
import { ErrorState } from "@/components/admin/error-state"
import { ImportReportDialog, type ImportReport } from "@/components/admin/import-report-dialog"
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
  code: string
}

interface Department {
  id: string
  name: string
  code: string
  schoolId: string
  school?: { name: string; code: string }
}

const deptSchema = z.object({
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
  schoolId: z.string().min(1, "School is required"),
})

type DeptFormInput = z.input<typeof deptSchema>
type DeptFormValues = z.output<typeof deptSchema>

export default function DepartmentsPage() {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [filterSchoolId, setFilterSchoolId] = useState<string>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Department | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null)
  const [importReport, setImportReport] = useState<ImportReport | null>(null)

  const { data: schools = [] } = useQuery<School[]>({
    queryKey: QUERY_KEYS.SCHOOLS,
    queryFn: () => apiGet<School[]>("/api/schools"),
  })

  const schoolIdParam = filterSchoolId !== "all" ? filterSchoolId : undefined

  const {
    data: departments = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Department[]>({
    queryKey: QUERY_KEYS.DEPARTMENTS(schoolIdParam),
    queryFn: () =>
      apiGet<Department[]>(
        schoolIdParam
          ? `/api/departments?school_id=${encodeURIComponent(schoolIdParam)}`
          : "/api/departments"
      ),
  })

  /** Departments create programmes and levels, so refresh everything that lists them. */
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["departments"] })
    queryClient.invalidateQueries({ queryKey: ["programmes"] })
    queryClient.invalidateQueries({ queryKey: ["levels"] })
    queryClient.invalidateQueries({ queryKey: ["courses"] })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.STATS })
  }

  const form = useForm<DeptFormInput, unknown, DeptFormValues>({
    resolver: zodResolver(deptSchema),
    defaultValues: { name: "", code: "", schoolId: "" },
  })

  const openCreate = () => {
    setEditTarget(null)
    form.reset({ name: "", code: "", schoolId: "" })
    setDialogOpen(true)
  }

  const openEdit = (dept: Department) => {
    setEditTarget(dept)
    form.reset({ name: dept.name, code: dept.code, schoolId: dept.schoolId })
    setDialogOpen(true)
  }

  const createMutation = useMutation({
    mutationFn: (body: DeptFormValues) => apiSend<Department>("/api/departments", "POST", body),
    onSuccess: () => {
      invalidateAll()
      toast.success("Department created with its ND and HND programmes and levels")
      setDialogOpen(false)
      form.reset()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: DeptFormValues }) =>
      apiSend<Department>(`/api/departments/${id}`, "PUT", body),
    onSuccess: () => {
      invalidateAll()
      toast.success("Department updated")
      setDialogOpen(false)
      setEditTarget(null)
      form.reset()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiSend(`/api/departments/${id}`, "DELETE"),
    onSuccess: () => {
      invalidateAll()
      toast.success("Department deleted")
      setDeleteTarget(null)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append("file", file)
      return apiUpload<ImportReport>("/api/departments/upload-csv", formData)
    },
    onSuccess: ({ data }) => {
      invalidateAll()
      setImportReport({
        imported: data?.imported ?? 0,
        skipped: data?.skipped ?? 0,
        errors: data?.errors ?? [],
      })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const onSubmit = (values: DeptFormValues) => {
    if (editTarget) updateMutation.mutate({ id: editTarget.id, body: values })
    else createMutation.mutate(values)
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  const getSchoolName = (schoolId: string) =>
    schools.find((s) => s.id === schoolId)?.name ?? "—"

  const columns: ColumnDef<Department>[] = [
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
      id: "school",
      header: "School",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.school?.name ?? getSchoolName(row.original.schoolId)}
        </span>
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Departments</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage departments within schools. CSV columns:{" "}
            <code className="font-mono text-xs">school_name,name,code</code>
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
          <Button onClick={openCreate}>Add Department</Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Select value={filterSchoolId} onValueChange={(v) => v != null && setFilterSchoolId(v)}>
          <SelectTrigger className="w-56">
            <SelectValue>
              {filterSchoolId === "all"
                ? "All Schools"
                : (schools.find((s) => s.id === filterSchoolId)?.name ?? "School")}
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
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !isLoading && departments.length === 0 ? (
        <EmptyState
          icon={Building}
          title="No departments found"
          description={filterSchoolId !== "all" ? "No departments in this school" : "Add your first department"}
          action={{ label: "Add Department", onClick: openCreate }}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable columns={columns} data={departments} isLoading={isLoading} />
          </div>
          <div className="md:hidden">
            <MobileCardList
              items={departments}
              isLoading={isLoading}
              renderCard={(dept) => (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-foreground">{dept.name}</p>
                    <p className="text-sm text-muted-foreground">{dept.code}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {dept.school?.name ?? getSchoolName(dept.schoolId)}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground" />}>
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-foreground/70 focus:bg-muted"
                        onClick={() => openEdit(dept)}
                      >
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:bg-muted"
                        onClick={() => setDeleteTarget(dept)}
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
              {editTarget ? "Edit Department" : "Add Department"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-foreground/70">School</Label>
              <Select
                value={form.watch("schoolId")}
                onValueChange={(v) => v != null && form.setValue("schoolId", v, { shouldValidate: true })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select school">
                    {schools.find((sc) => sc.id === form.watch("schoolId"))?.name ?? "Select school"}
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
              {form.formState.errors.schoolId && (
                <p className="text-sm text-destructive">{form.formState.errors.schoolId.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-foreground/70">Name</Label>
              <Input placeholder="e.g. Computer Science" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-foreground/70">Code</Label>
              <Input placeholder="e.g. CSC" className="uppercase" {...form.register("code")} />
              {form.formState.errors.code && (
                <p className="text-sm text-destructive">{form.formState.errors.code.message}</p>
              )}
            </div>
            {!editTarget && (
              <p className="text-xs text-muted-foreground">
                Adding a department automatically creates its two programmes — National Diploma (ND)
                and Higher National Diploma (HND) — and its four levels ND 1, ND 2, HND 1 and HND 2.
              </p>
            )}
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
        title="Delete Department"
        description={`Delete "${deleteTarget?.name}"? Its programmes, levels and courses are deleted with it. A department with registered students cannot be deleted. This action cannot be undone.`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
      />

      <ImportReportDialog
        report={importReport}
        onOpenChange={(open) => !open && setImportReport(null)}
        title="Department import report"
      />
    </div>
  )
}
