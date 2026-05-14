"use client"

import { useState, useEffect, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { Users } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"

import { QUERY_KEYS } from "@/lib/query-keys"
import { DataTable } from "@/components/admin/data-table"
import { MobileCardList } from "@/components/admin/mobile-card-list"
import { EmptyState } from "@/components/admin/empty-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface School { id: string; name: string }
interface Department { id: string; name: string; schoolId: string }
interface Level { id: string; name: string }

interface Student {
  id: string
  matricNumber: string
  fullName: string
  email: string
  level?: { name: string }
  department?: { name: string }
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

export default function StudentsPage() {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [filterSchoolId, setFilterSchoolId] = useState<string>("all")
  const [filterDeptId, setFilterDeptId] = useState<string>("all")
  const [filterLevelId, setFilterLevelId] = useState<string>("all")
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search, 300)

  // Page reset is handled inline in filter/search handlers (avoids setState-in-effect)

  const { data: schools = [] } = useQuery<School[]>({
    queryKey: QUERY_KEYS.SCHOOLS,
    queryFn: async () => {
      const res = await fetch("/api/schools")
      const json = await res.json()
      return json.data ?? []
    },
  })

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: QUERY_KEYS.DEPARTMENTS(filterSchoolId !== "all" ? filterSchoolId : undefined),
    queryFn: async () => {
      const url =
        filterSchoolId !== "all"
          ? `/api/departments?school_id=${filterSchoolId}`
          : "/api/departments"
      const res = await fetch(url)
      const json = await res.json()
      return json.data ?? []
    },
  })

  const { data: deptLevels = [] } = useQuery<Level[]>({
    queryKey: QUERY_KEYS.DEPT_LEVELS(filterDeptId !== "all" ? filterDeptId : undefined),
    queryFn: async () => {
      if (filterDeptId === "all") return []
      const res = await fetch(`/api/levels?department_id=${filterDeptId}`)
      const json = await res.json()
      return json.data ?? []
    },
    enabled: filterDeptId !== "all",
  })

  const deptIdParam = filterDeptId !== "all" ? filterDeptId : undefined
  const levelIdParam = filterLevelId !== "all" ? filterLevelId : undefined

  const { data, isLoading } = useQuery<StudentsResponse>({
    queryKey: [...QUERY_KEYS.STUDENTS, debouncedSearch, deptIdParam, levelIdParam, page],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set("search", debouncedSearch)
      if (deptIdParam) params.set("department_id", deptIdParam)
      if (levelIdParam) params.set("level_id", levelIdParam)
      params.set("page", String(page))
      const res = await fetch(`/api/students?${params}`)
      const json = await res.json()
      if (Array.isArray(json.data)) {
        return { students: json.data, total: json.data.length, page: 1, pages: 1 }
      }
      return json.data ?? { students: [], total: 0, page: 1, pages: 1 }
    },
  })

  const students = data?.students ?? []
  const totalPages = data?.pages ?? 1

  const handleRowClick = useCallback(
    (student: Student) => router.push(`/admin/students/${student.id}`),
    [router]
  )

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
      id: "view",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => handleRowClick(row.original)}
          >
            View
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Students</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">View registered students</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by name or matric no…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="w-64"
        />

        <Select
          value={filterSchoolId}
          onValueChange={(v) => {
            if (v == null) return
            setFilterSchoolId(v)
            setFilterDeptId("all")
            setPage(1)
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue>
              {filterSchoolId === "all"
                ? "All Schools"
                : (schools.find(s => s.id === filterSchoolId)?.name ?? "School")}
            </SelectValue>
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
          <SelectTrigger className="w-48">
            <SelectValue>
              {filterDeptId === "all"
                ? "All Departments"
                : (departments.find(d => d.id === filterDeptId)?.name ?? "Department")}
            </SelectValue>
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
          <SelectTrigger className="w-40">
            <SelectValue>
              {filterDeptId === "all"
                ? "Select dept first"
                : filterLevelId === "all"
                ? "All Levels"
                : (deptLevels.find(l => l.id === filterLevelId)?.name ?? "Level")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            {deptLevels.map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!isLoading && students.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students found"
          description={debouncedSearch ? "Try a different search term" : "Students will appear here once they register"}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable columns={columns} data={students} isLoading={isLoading} />
          </div>
          <div className="md:hidden">
            <MobileCardList
              items={students}
              isLoading={isLoading}
              renderCard={(student) => (
                <button
                  className="w-full text-left"
                  onClick={() => handleRowClick(student)}
                >
                  <p className="font-medium text-foreground">{student.fullName}</p>
                  <p className="font-mono text-sm text-muted-foreground">{student.matricNumber}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {student.department?.name ?? "—"} · {student.level?.name ?? "—"}
                  </p>
                </button>
              )}
            />
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted-foreground">
                Page {data?.page ?? 1} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || isLoading}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || isLoading}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
