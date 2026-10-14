"use client"

import { useMemo, useState, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { BookMarked, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ThemeToggle } from "@/components/theme-toggle"
import { QUERY_KEYS } from "@/lib/query-keys"
import { ApiError, apiGet, apiSend, errorMessage } from "@/lib/fetcher"
import { sessionSemester } from "@/lib/sessions"
import { useActiveSessions } from "@/hooks/use-selected-session"

type Course = {
  id: string
  code: string
  title: string
  creditUnits: number
  semester: "FIRST" | "SECOND"
}

type StudentProfile = { id: string; levelId: string; fullName: string }

/** Enrolling twice is harmless — e.g. after a retry where some courses already went through. */
function isAlreadyEnrolled(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && /already enrolled/i.test(err.message)
}

function CourseSkeletons() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  )
}

/** A message in place of the course list, with a way on to the timetable. */
function Notice({ title, text, error, onRetry }: {
  title: string
  text: string
  error?: boolean
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <BookMarked className={error ? "size-8 text-destructive/70" : "size-8 text-muted-foreground/60"} />
      <div className="space-y-1">
        <p className={error ? "text-sm font-medium text-destructive" : "text-sm font-medium text-foreground"}>
          {title}
        </p>
        <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">{text}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
        <Button size="sm" render={<Link href="/dashboard" />} nativeButton={false}>
          Continue to timetable
        </Button>
      </div>
    </div>
  )
}

function CoursesContent() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()

  // The sign-up form passes the session and level; without them, fall back to the newest
  // active session and the signed-in student's own level.
  const sessionParam = searchParams.get("session") ?? ""
  const levelIdParam = searchParams.get("level_id") ?? ""

  const activeSessions = useActiveSessions()
  const session = sessionParam || activeSessions.data?.[0]?.name || ""
  const semester = sessionSemester(session)

  const profileQuery = useQuery({
    queryKey: QUERY_KEYS.STUDENT("me"),
    queryFn: () => apiGet<StudentProfile>("/api/students/me"),
    enabled: !levelIdParam,
  })
  const levelId = levelIdParam || profileQuery.data?.levelId || ""

  const coursesQuery = useQuery({
    queryKey: QUERY_KEYS.COURSES(levelId),
    queryFn: () => apiGet<Course[]>(`/api/courses?level_id=${encodeURIComponent(levelId)}`),
    enabled: !!levelId,
  })

  // Courses for the session's semester
  const visibleCourses = useMemo(() => {
    const all = coursesQuery.data ?? []
    return semester ? all.filter((c) => c.semester === semester) : all
  }, [coursesQuery.data, semester])

  // Every course starts ticked — students take all courses at their level and untick electives.
  const [unticked, setUnticked] = useState<Set<string>>(new Set())
  const selectedIds = visibleCourses.filter((c) => !unticked.has(c.id)).map((c) => c.id)
  const [finished, setFinished] = useState(false)

  function toggleCourse(id: string) {
    setUnticked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const enrollMutation = useMutation({
    mutationFn: async (courseIds: string[]) => {
      const results = await Promise.allSettled(
        courseIds.map((courseId) => apiSend("/api/enrollments", "POST", { courseId, session }))
      )
      const failed = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected" && !isAlreadyEnrolled(r.reason)
      )
      if (failed.length > 0) {
        const reason = errorMessage(failed[0].reason)
        throw new Error(
          failed.length === courseIds.length
            ? reason
            : `${failed.length} of ${courseIds.length} courses couldn't be added: ${reason}`
        )
      }
    },
    onSuccess: () => {
      setFinished(true)
      queryClient.invalidateQueries({ queryKey: ["enrollments"] })
      queryClient.invalidateQueries({ queryKey: ["timetable"] })
      toast.success("Enrollment complete!")
      router.replace("/dashboard")
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const needSessions = !sessionParam
  const needProfile = !levelIdParam
  const loading =
    (needSessions && activeSessions.isPending) ||
    (needProfile && profileQuery.isPending) ||
    (!!levelId && coursesQuery.isPending)

  let body: React.ReactNode
  let canEnroll = false
  if (needSessions && activeSessions.isError) {
    body = (
      <Notice
        error
        title="Couldn't load sessions"
        text={errorMessage(activeSessions.error)}
        onRetry={() => activeSessions.refetch()}
      />
    )
  } else if (needProfile && profileQuery.isError) {
    body = (
      <Notice
        error
        title="Couldn't load your profile"
        text={errorMessage(profileQuery.error)}
        onRetry={() => profileQuery.refetch()}
      />
    )
  } else if (coursesQuery.isError) {
    body = (
      <Notice
        error
        title="Couldn't load courses"
        text={errorMessage(coursesQuery.error)}
        onRetry={() => coursesQuery.refetch()}
      />
    )
  } else if (loading) {
    body = <CourseSkeletons />
  } else if (!session) {
    body = (
      <Notice
        title="Course registration isn't open yet"
        text="You can choose your courses from the Courses tab once registration opens."
      />
    )
  } else if (visibleCourses.length === 0) {
    const semesterLabel =
      semester === "SECOND" ? "Second Semester " : semester === "FIRST" ? "First Semester " : ""
    body = (
      <Notice
        title="No courses to choose yet"
        text={`No ${semesterLabel}courses have been added for your level yet. You can enrol later from the Courses tab.`}
      />
    )
  } else {
    canEnroll = true
    body = (
      <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1 -mr-1">
        {visibleCourses.map((course) => {
          const selected = !unticked.has(course.id)
          return (
            <label
              key={course.id}
              className={[
                "flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors",
                selected
                  ? "border-primary/50 bg-primary/10"
                  : "border-border bg-card hover:border-border/70 hover:bg-muted/40",
              ].join(" ")}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary cursor-pointer"
                checked={selected}
                onChange={() => toggleCourse(course.id)}
              />
              <div className="flex flex-1 flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground">
                    {course.code}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 h-4 border-border text-muted-foreground"
                  >
                    {course.semester === "FIRST" ? "1st Sem" : "2nd Sem"}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 h-4"
                  >
                    {course.creditUnits} CU
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground truncate">
                  {course.title}
                </span>
              </div>
            </label>
          )
        })}
      </div>
    )
  }

  const submitting = enrollMutation.isPending || finished

  return (
    <div className="bg-card border border-border rounded-xl p-8 w-full max-w-md shadow-sm my-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Select Your Courses</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Choose the courses you&apos;re registered for this session
          </p>
          {session && <p className="text-xs text-muted-foreground/70 mt-1">{session}</p>}
        </div>
        <ThemeToggle />
      </div>

      {body}

      {canEnroll && (
        <div className="mt-6 space-y-2">
          {selectedIds.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              {selectedIds.length} course{selectedIds.length !== 1 ? "s" : ""} selected
            </p>
          )}
          <Button
            className="w-full"
            disabled={selectedIds.length === 0 || submitting}
            onClick={() => enrollMutation.mutate(selectedIds)}
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Enrolling…
              </>
            ) : (
              "Complete Enrollment"
            )}
          </Button>
        </div>
      )}

      {(canEnroll || loading) && (
        <p className="mt-4 text-center text-sm">
          <Link
            href="/dashboard"
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Skip for now
          </Link>
        </p>
      )}
    </div>
  )
}

export default function CoursesPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-card border border-border rounded-xl p-8 w-full max-w-md shadow-sm my-8">
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-4 w-64 mb-6" />
          <CourseSkeletons />
        </div>
      }
    >
      <CoursesContent />
    </Suspense>
  )
}
