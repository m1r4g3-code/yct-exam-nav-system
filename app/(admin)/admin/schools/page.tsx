"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { MoreHorizontal, Building2 } from "lucide-react"
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

const schoolSchema = z.object({
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
})

type SchoolFormInput = z.input<typeof schoolSchema>
type SchoolFormValues = z.output<typeof schoolSchema>

export default function SchoolsPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<School | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<School | null>(null)

  const {
    data: schools = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<School[]>({
    queryKey: QUERY_KEYS.SCHOOLS,
    queryFn: () => apiGet<School[]>("/api/schools"),
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.SCHOOLS })
    queryClient.invalidateQueries({ queryKey: ["departments"] })
    queryClient.invalidateQueries({ queryKey: ["programmes"] })
    queryClient.invalidateQueries({ queryKey: ["levels"] })
    queryClient.invalidateQueries({ queryKey: ["courses"] })
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.STATS })
  }

  const form = useForm<SchoolFormInput, unknown, SchoolFormValues>({
    resolver: zodResolver(schoolSchema),
    defaultValues: { name: "", code: "" },
  })

  const openCreate = () => {
    setEditTarget(null)
    form.reset({ name: "", code: "" })
    setDialogOpen(true)
  }

  const openEdit = (school: School) => {
    setEditTarget(school)
    form.reset({ name: school.name, code: school.code })
    setDialogOpen(true)
  }

  const createMutation = useMutation({
    mutationFn: (body: SchoolFormValues) => apiSend<School>("/api/schools", "POST", body),
    onSuccess: () => {
      invalidateAll()
      toast.success("School created")
      setDialogOpen(false)
      form.reset()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: SchoolFormValues }) =>
      apiSend<School>(`/api/schools/${id}`, "PUT", body),
    onSuccess: () => {
      invalidateAll()
      toast.success("School updated")
      setDialogOpen(false)
      setEditTarget(null)
      form.reset()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiSend(`/api/schools/${id}`, "DELETE"),
    onSuccess: () => {
      invalidateAll()
      toast.success("School deleted")
      setDeleteTarget(null)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const onSubmit = (values: SchoolFormValues) => {
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, body: values })
    } else {
      createMutation.mutate(values)
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  const columns: ColumnDef<School>[] = [
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
              <DropdownMenuItem onClick={() => openEdit(row.original)}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
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
        title="Schools"
        description="Manage schools and faculties"
        action={{ label: "Add School", onClick: openCreate }}
      />

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !isLoading && schools.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No schools yet"
          description="Add your first school to get started"
          action={{ label: "Add School", onClick: openCreate }}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable columns={columns} data={schools} isLoading={isLoading} />
          </div>
          <div className="md:hidden">
            <MobileCardList
              items={schools}
              isLoading={isLoading}
              renderCard={(school) => (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-foreground">{school.name}</p>
                    <p className="text-sm text-muted-foreground">{school.code}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground" />}>
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(school)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteTarget(school)}
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
            <DialogTitle>{editTarget ? "Edit School" : "Add School"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input placeholder="e.g. School of Engineering" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input placeholder="e.g. SOE" className="uppercase" {...form.register("code")} />
              {form.formState.errors.code && (
                <p className="text-sm text-destructive">{form.formState.errors.code.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={isSaving}>
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
        title="Delete School"
        description={`Delete "${deleteTarget?.name}"? This also deletes all of its departments, programmes, levels and courses. A school whose departments still have registered students cannot be deleted. This action cannot be undone.`}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}
