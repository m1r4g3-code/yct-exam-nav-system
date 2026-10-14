"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { KeyRound, MoreHorizontal, Pencil, Trash2, Users } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"

import { QUERY_KEYS } from "@/lib/query-keys"
import { apiGet } from "@/lib/fetcher"
import { DataTable } from "@/components/admin/data-table"
import { MobileCardList } from "@/components/admin/mobile-card-list"
import { EmptyState } from "@/components/admin/empty-state"
import { ErrorState } from "@/components/admin/error-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { type StudentRecord, useStudentActions } from "./student-dialogs"

interface School { id: string; name: string; code: string }
interface Department { id: string; name: string; code: string }
interface Level { id: string; name: string; programme?: { name: string; code: string } }

interface Student extends StudentRecord {
  level?: { name: string }
  department?: { name: string; code: string }
}

interface StudentsResponse {
  students: Student[]
  total: number
  page: number
  pages: number
}

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

function StudentActionsMenu({
  student,
  actions,
}: {
  student: Student
  actions: ReturnType<typeof useStudentActions>
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground" />}
      >
        <MoreHorizontal className="size-4" />
        <span className="sr-only">Actions for {student.fullName}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => actions.edit(student)}>
          <Pencil />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => actions.resetPassword(student)}>
          <KeyRound />
          Reset password
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => actions.remove(student)}>
          <Trash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function StudentsPage() {
  const [search, setSearch] = useState("")
  const [filterSchoolId, setFilterSchoolId] = useState<string>("all")
  const [filterDeptId, setFilterDeptId] = useState<string>("all")
  const [filterLevelId, setFilterLevelId] = useState<string>("all")
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search, 300)
  const actions = useStudentActions()

  // Page reset is handled inline in filter/search handlers (avoids setState-in-effect)

  const schoolIdParam = filterSchoolId !== "all" ? filterSchoolId : undefined
  const deptIdParam = filterDeptId !== "all" ? filterDeptId : undefined
  const levelIdParam = filterLevelId !== "all" ? filterLevelId : undefined

  const { data: schools = [] } = useQuery({
    queryKey: QUERY_KEYS.SCHOOLS,
    queryFn: () => apiGet<School[]>("/api/schools"),
  })

  const { data: departments = [] } = useQuery({
    queryKey: QUERY_KEYS.DEPARTMENTS(schoolIdParam),
    queryFn: () =>
      apiGet<Department[]>(
        schoolIdParam ? `/api/departments?school_id=${encodeURIComponent(schoolIdParam)}` : "/api/departments"
      ),
  })

  const { data: deptLevels = [] } = useQuery({
    queryKey: QUERY_KEYS.DEPT_LEVELS(deptIdParam),
    queryFn: () => apiGet<Level[]>(`/api/levels?department_id=${encodeURIComponent(deptIdParam ?? "")}`),
    enabled: !!deptIdParam,
  })

  const studentsQuery = useQuery({
    queryKey: [...QUERY_KEYS.STUDENTS, "list", debouncedSearch, schoolIdParam, deptIdParam, levelIdParam, page],
    queryFn: () => {
      const params = new URLSearchParams()
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim())
      if (schoolIdParam) params.set("school_id", schoolIdParam)
      if (deptIdParam) params.set("department_id", deptIdParam)
      if (levelIdParam) params.set("level_id", levelIdParam)
      params.set("page", String(page))
      params.set("limit", "50")
      return apiGet<StudentsResponse>(`/api/students?${params}`)
    },
    // Keep the current page on screen while the next one loads.
    placeholderData: keepPreviousData,
  })
  const { data, isPending, isError, error, refetch, isPlaceholderData } = studentsQuery

  const students = data?.students ?? []
  const total = data?.total ?? 0
  const totalPages = data?.pages ?? 1
  const filtered = !!(debouncedSearch.trim() || schoolIdParam || deptIdParam || levelIdParam)

  const columns: ColumnDef<Student>[] = [
    {
      accessorKey: "matricNumber",
      header: "Matric No",
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium text-foreground">{row.original.matricNumber}</span>
      ),
    },
    {
      accessorKey: "fullName",
      header: "Full Name",
      cell: ({ row }) => (
        <span className="text-foreground/70">{row.original.fullName}</span>
      ),
    },
    {
      id: "department",
      header: "Department",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.department?.name ?? "—"}</span>
      ),
    },
    {
      id: "level",
      header: "Level",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.original.level?.name ?? "—"}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            render={<Link href={`/admin/students/${row.original.id}`} />}
            nativeButton={false}
          >
            View
          </Button>
          <StudentActionsMenu student={row.original} actions={actions} />
        </div>
      ),
    },
  ]

  const schoolLabel =
    filterSchoolId === "all"
      ? "All Schools"
      : (schools.find((s) => s.id === filterSchoolId)?.name ?? "School")
  const departmentLabel =
    filterDeptId === "all"
      ? "All Departments"
      : (departments.find((d) => d.id === filterDeptId)?.name ?? "Department")
  const levelLabel =
    filterDeptId === "all"
      ? "Select dept first"
      : filterLevelId === "all"
      ? "All Levels"
      : (deptLevels.find((l) => l.id === filterLevelId)?.name ?? "Level")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Students</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          View and manage registered students
          {data && !isPending && ` · ${total} student${total === 1 ? "" : "s"}${filtered ? " found" : ""}`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by name or matric no…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="w-full sm:w-64"
        />

        <Select
          value={filterSchoolId}
          onValueChange={(v) => {
            if (v == null) return
            setFilterSchoolId(v)
            // A department or level from another school would hide every student.
            setFilterDeptId("all")
            setFilterLevelId("all")
            setPage(1)
          }}
        >
          <SelectTrigger className="w-full sm:w-48" aria-label="School">
            <SelectValue>{schoolLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Schools</SelectItem>
            {schools.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filterDeptId}
          onValueChange={(v) => {
            if (v != null) {
              setFilterDeptId(v)
              setFilterLevelId("all")
              setPage(1)
            }
          }}
        >
          <SelectTrigger className="w-full sm:w-48" aria-label="Department">
            <SelectValue>{departmentLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filterLevelId}
          onValueChange={(v) => { if (v != null) { setFilterLevelId(v); setPage(1) } }}
          disabled={filterDeptId === "all"}
        >
          <SelectTrigger className="w-full sm:w-40" aria-label="Level">
            <SelectValue>{levelLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            {deptLevels.map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError && !data ? (
        <ErrorState title="Couldn't load students" error={error} onRetry={() => refetch()} />
      ) : !isPending && students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students found"
          description={filtered ? "Try a different search or filter" : "Students will appear here once they register"}
        />
      ) : (
        <>
          <div className={`hidden md:block ${isPlaceholderData ? "opacity-60 transition-opacity" : ""}`}>
            <DataTable columns={columns} data={students} isLoading={isPending} />
          </div>
          <div className={`md:hidden ${isPlaceholderData ? "opacity-60 transition-opacity" : ""}`}>
            <MobileCardList
              items={students}
              isLoading={isPending}
              renderCard={(student) => (
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/admin/students/${student.id}`} className="min-w-0 flex-1 text-left">
                    <p className="font-medium text-foreground">{student.fullName}</p>
                    <p className="font-mono text-sm text-muted-foreground">{student.matricNumber}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {student.department?.name ?? "—"} · {student.level?.name ?? "—"}
                    </p>
                  </Link>
                  <StudentActionsMenu student={student} actions={actions} />
                </div>
              )}
            />
          </div>

          {isError && data && (
            <p className="text-sm text-destructive">
              Couldn&apos;t refresh the list.{" "}
              <button type="button" className="underline underline-offset-2" onClick={() => refetch()}>
                Try again
              </button>
            </p>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted-foreground">
                Page {data?.page ?? page} of {totalPages}
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
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || isPlaceholderData}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {actions.dialogs}
    </div>
  )
}
