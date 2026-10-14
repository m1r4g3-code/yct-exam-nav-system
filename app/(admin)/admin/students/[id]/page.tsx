"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, User, BookOpen, Pencil, KeyRound, Trash2, UserX } from "lucide-react"
import { QUERY_KEYS } from "@/lib/query-keys"
import { ApiError, apiGet } from "@/lib/fetcher"
import { ErrorState } from "@/components/admin/error-state"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { type StudentRecord, useStudentActions } from "../student-dialogs"

interface StudentDetail extends StudentRecord {
  level: { id: string; name: string; year: number }
  programme: { id: string; name: string; code: string }
  department: { id: string; name: string; code: string }
  enrollments: {
    id: string
    session: string
    course: { id: string; code: string; title: string }
  }[]
}

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  // After deleting, go back to the list (the record no longer exists).
  const actions = useStudentActions({ onDeleted: () => router.replace("/admin/students") })

  const { data: student, isError, error, refetch } = useQuery({
    // Under ["students"] so every student change refreshes this page too.
    queryKey: [...QUERY_KEYS.STUDENTS, "detail", id],
    queryFn: () => apiGet<StudentDetail>(`/api/students/${encodeURIComponent(id)}`),
    enabled: !!id,
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  })

  const notFound = isError && error instanceof ApiError && error.status === 404

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground"
          render={<Link href="/admin/students" />}
          nativeButton={false}
          aria-label="Back to students"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Student Profile</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Enrollment details</p>
        </div>
      </div>

      {student && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => actions.edit(student)}>
            <Pencil className="size-3.5" />
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={() => actions.resetPassword(student)}>
            <KeyRound className="size-3.5" />
            Reset password
          </Button>
          <Button variant="destructive" size="sm" onClick={() => actions.remove(student)}>
            <Trash2 className="size-3.5" />
            Delete
          </Button>
        </div>
      )}
    </div>
  )

  if (notFound) {
    return (
      <div className="space-y-6 max-w-3xl">
        {header}
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card py-16 text-center">
          <UserX className="size-10 text-muted-foreground/70" />
          <p className="text-sm font-medium text-foreground">Student not found</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            This student may have been deleted, or the link is wrong.
          </p>
          <Button variant="outline" size="sm" render={<Link href="/admin/students" />} nativeButton={false}>
            Back to students
          </Button>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="space-y-6 max-w-3xl">
        {header}
        <ErrorState title="Couldn't load this student" error={error} onRetry={() => refetch()} />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {header}

      {/* Profile card */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
            <User className="size-5 text-muted-foreground" />
          </div>
          <div>
            {!student ? (
              <>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-32 mt-1" />
              </>
            ) : (
              <>
                <p className="font-semibold text-foreground">{student.fullName}</p>
                <p className="font-mono text-sm text-muted-foreground">{student.matricNumber}</p>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 text-sm">
          {[
            { label: "Email", value: student?.email },
            {
              label: "Department",
              value: student?.department ? `${student.department.name} (${student.department.code})` : undefined,
            },
            { label: "Programme", value: student?.programme?.name },
            { label: "Level", value: student?.level?.name },
          ].map(({ label, value }) => (
            <div key={label} className="min-w-0">
              <p className="text-muted-foreground text-xs">{label}</p>
              {!student ? (
                <Skeleton className="h-4 w-24 mt-0.5" />
              ) : (
                <p className="text-foreground/70 mt-0.5 break-words">{value ?? "—"}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Enrollments */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium text-foreground/70">Enrollments</h2>
        </div>

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Course Code</TableHead>
                <TableHead className="text-muted-foreground">Course Title</TableHead>
                <TableHead className="text-muted-foreground">Session</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!student ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    {Array.from({ length: 3 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : student.enrollments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground text-sm">
                    No enrollments yet
                  </TableCell>
                </TableRow>
              ) : (
                student.enrollments.map((enrollment) => (
                  <TableRow key={enrollment.id} className="border-border hover:bg-muted/40">
                    <TableCell className="font-mono text-foreground font-medium">
                      {enrollment.course.code}
                    </TableCell>
                    <TableCell className="text-foreground/70 whitespace-normal">{enrollment.course.title}</TableCell>
                    <TableCell className="text-muted-foreground">{enrollment.session}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {actions.dialogs}
    </div>
  )
}
