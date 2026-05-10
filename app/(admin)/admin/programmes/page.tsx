"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { MoreHorizontal, BookOpen } from "lucide-react"
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
  schoolId: string
}

interface Programme {
  id: string
  name: string
  code: string
  departmentId: string
  department?: { name: string }
}

const programmeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required"),
  departmentId: z.string().min(1, "Department is required"),
})

type ProgrammeFormValues = z.infer<typeof programmeSchema>

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
    queryFn: async () => {
      const res = await fetch("/api/schools")
      const json = await res.json()
      return json.data ?? []
    },
  })

  const filterSchoolIdParam = filterSchoolId !== "all" ? filterSchoolId : undefined

  const { data: filterDepts = [] } = useQuery<Department[]>({
    queryKey: QUERY_KEYS.DEPARTMENTS(filterSchoolIdParam),
    queryFn: async () => {
      const url = filterSchoolIdParam
        ? `/api/departments?school_id=${filterSchoolIdParam}`
        : "/api/departments"
      const res = await fetch(url)
      const json = await res.json()
      return json.data ?? []
    },
  })

  const { data: formDepts = [] } = useQuery<Department[]>({
    queryKey: QUERY_KEYS.DEPARTMENTS(formSchoolId || undefined),
    queryFn: async () => {
      const url = formSchoolId
        ? `/api/departments?school_id=${formSchoolId}`
        : "/api/departments"
      const res = await fetch(url)
      const json = await res.json()
      return json.data ?? []
    },
    enabled: true,
  })

  const deptIdParam = filterDeptId !== "all" ? filterDeptId : undefined

  const { data: programmes = [], isLoading } = useQuery<Programme[]>({
    queryKey: QUERY_KEYS.PROGRAMMES(deptIdParam),
    queryFn: async () => {
      const url = deptIdParam
        ? `/api/programmes?department_id=${deptIdParam}`
        : "/api/programmes"
      const res = await fetch(url)
      const json = await res.json()
      return json.data ?? []
    },
  })

  const form = useForm<ProgrammeFormValues>({
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
    const dept = filterDepts.find((d) => d.id === programme.departmentId)
    const schoolId = dept?.schoolId ?? ""
    setFormSchoolId(schoolId)
    form.reset({ name: programme.name, code: programme.code, departmentId: programme.departmentId })
    setDialogOpen(true)
  }

  const createMutation = useMutation({
    mutationFn: async (body: ProgrammeFormValues) => {
      const res = await fetch("/api/programmes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
      return json.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programmes"] })
      toast.success("Programme created")
      setDialogOpen(false)
      form.reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: async (body: ProgrammeFormValues) => {
      const res = await fetch(`/api/programmes/${editTarget!.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
      return json.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programmes"] })
      toast.success("Programme updated")
      setDialogOpen(false)
      setEditTarget(null)
      form.reset()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/programmes/${id}`, { method: "DELETE" })
      const json = await res.json()
      if (!json.success) throw new Error(json.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["programmes"] })
      toast.success("Programme deleted")
      setDeleteTarget(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const onSubmit = (values: ProgrammeFormValues) => {
    if (editTarget) updateMutation.mutate(values)
    else createMutation.mutate(values)
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  const getDeptName = (departmentId: string) => {
    const dept = filterDepts.find((d) => d.id === departmentId)
    return dept?.name ?? "—"
  }

  const columns: ColumnDef<Programme>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <span className="font-medium text-zinc-50">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "code",
      header: "Code",
      cell: ({ row }) => (
        <span className="text-zinc-400">{row.original.code}</span>
      ),
    },
    {
      id: "department",
      header: "Department",
      cell: ({ row }) => (
        <span className="text-zinc-400">
          {row.original.department?.name ?? getDeptName(row.original.departmentId)}
        </span>
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
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by school" />
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
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Filter by department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {filterDepts.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!isLoading && programmes.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No programmes found"
          description="Add your first programme to get started"
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
                    <p className="font-medium text-zinc-50">{prog.name}</p>
                    <p className="text-sm text-zinc-400">{prog.code}</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      {prog.department?.name ?? getDeptName(prog.departmentId)}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="text-zinc-400" />}>
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                      <DropdownMenuItem
                        className="text-zinc-300 focus:bg-zinc-800"
                        onClick={() => openEdit(prog)}
                      >
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-400 focus:bg-zinc-800"
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
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-zinc-50">
              {editTarget ? "Edit Programme" : "Add Programme"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-zinc-300">School</Label>
              <Select
                value={formSchoolId}
                onValueChange={(v) => {
                  if (v == null) return
                  setFormSchoolId(v)
                  form.setValue("departmentId", "", { shouldValidate: false })
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select school first" />
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
              <Label className="text-zinc-300">Department</Label>
              <Select
                value={form.watch("departmentId")}
                onValueChange={(v) => v != null && form.setValue("departmentId", v, { shouldValidate: true })}
                disabled={!formSchoolId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={formSchoolId ? "Select department" : "Select school first"} />
                </SelectTrigger>
                <SelectContent>
                  {formDepts.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.departmentId && (
                <p className="text-sm text-red-400">{form.formState.errors.departmentId.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-300">Name</Label>
              <Input placeholder="e.g. Computer Science" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-sm text-red-400">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-zinc-300">Code</Label>
              <Input placeholder="e.g. CSC" {...form.register("code")} />
              {form.formState.errors.code && (
                <p className="text-sm text-red-400">{form.formState.errors.code.message}</p>
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
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
