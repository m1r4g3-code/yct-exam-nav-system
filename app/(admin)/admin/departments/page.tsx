"use client"

import { useState, useRef } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { MoreHorizontal, Building, Upload } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"

import { QUERY_KEYS } from "@/lib/query-keys"
import { DataTable } from "@/components/admin/data-table"
import { MobileCardList } from "@/components/admin/mobile-card-list"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
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
  school?: { name: string }
}

const deptSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required"),
  schoolId: z.string().min(1, "School is required"),
})

type DeptFormValues = z.infer<typeof deptSchema>

export default function DepartmentsPage() {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [filterSchoolId, setFilterSchoolId] = useState<string>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Department | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null)

  const { data: schools = [] } = useQuery<School[]>({
    queryKey: QUERY_KEYS.SCHOOLS,
    queryFn: async () => {
      const res = await fetch("/api/schools")
      const json = await res.json()
      return json.data ?? []
    },
  })

  const schoolIdParam = filterSchoolId !== "all" ? filterSchoolId : undefined

  const { data: departments = [], isLoading } = useQuery<Department[]>({
    queryKey: QUERY_KEYS.DEPARTMENTS(schoolIdParam),
    queryFn: async () => {
      const url = schoolIdParam
        ? `/api/departments?school_id=${schoolIdParam}`
        : "/api/departments"
      const res = await fetch(url)
      const json = await res.json()
      return json.data ?? []
    },
  })

  const form = useForm<DeptFormValues>({
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
    mutationFn: async (body: DeptFormValues) => {
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
      return json.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] })
      toast.success("Department created")
      setDialogOpen(false)
      form.reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: async (body: DeptFormValues) => {
      const res = await fetch(`/api/departments/${editTarget!.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
      return json.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] })
      toast.success("Department updated")
      setDialogOpen(false)
      setEditTarget(null)
      form.reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/departments/${id}`, { method: "DELETE" })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] })
      toast.success("Department deleted")
      setDeleteTarget(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/departments/upload-csv", { method: "POST", body: formData })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
      return json.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["departments"] })
      toast.success(`Imported: ${data?.imported ?? 0}, Skipped: ${data?.skipped ?? 0}`)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const onSubmit = (values: DeptFormValues) => {
    if (editTarget) updateMutation.mutate(values)
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
      <div className="flex flex-row items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Departments</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Manage departments within schools</p>
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

      {!isLoading && departments.length === 0 ? (
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
                <SelectTrigger>
                  <SelectValue placeholder="Select school" />
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
              <Input placeholder="e.g. CSC" {...form.register("code")} />
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
        title="Delete Department"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
