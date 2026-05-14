"use client"

import { useParams, useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, User, BookOpen } from "lucide-react"
import { QUERY_KEYS } from "@/lib/query-keys"
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

interface StudentDetail {
  id: string
  matricNumber: string
  fullName: string
  email: string
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

  const { data: student, isLoading } = useQuery<StudentDetail>({
    queryKey: [...QUERY_KEYS.STUDENTS, id],
    queryFn: async () => {
      const res = await fetch(`/api/students/${id}`)
      const json = await res.json()
      return json.data
    },
    enabled: !!id,
  })

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => router.back()}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Student Profile</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Enrollment details</p>
        </div>
      </div>

      {/* Profile card */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
            <User className="size-5 text-muted-foreground" />
          </div>
          <div>
            {isLoading ? (
              <>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-32 mt-1" />
              </>
            ) : (
              <>
                <p className="font-semibold text-foreground">{student?.fullName}</p>
                <p className="font-mono text-sm text-muted-foreground">{student?.matricNumber}</p>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 text-sm">
          {[
            { label: "Email", value: student?.email },
            { label: "Department", value: student?.department?.name },
            { label: "Programme", value: student?.programme?.name },
            { label: "Level", value: student?.level?.name },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-muted-foreground text-xs">{label}</p>
              {isLoading ? (
                <Skeleton className="h-4 w-24 mt-0.5" />
              ) : (
                <p className="text-foreground/70 mt-0.5">{value ?? "—"}</p>
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
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i} className="border-border">
                    {Array.from({ length: 3 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : student?.enrollments?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground text-sm">
                    No enrollments yet
                  </TableCell>
                </TableRow>
              ) : (
                student?.enrollments?.map((enrollment) => (
                  <TableRow key={enrollment.id} className="border-border hover:bg-muted/40">
                    <TableCell className="font-mono text-foreground font-medium">
                      {enrollment.course.code}
                    </TableCell>
                    <TableCell className="text-foreground/70">{enrollment.course.title}</TableCell>
                    <TableCell className="text-muted-foreground">{enrollment.session}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
