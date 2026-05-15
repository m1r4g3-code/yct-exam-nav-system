"use client"

import { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ThemeToggle } from "@/components/theme-toggle"

type Course = {
  id: string
  code: string
  title: string
  creditUnits: number
  semester: "FIRST" | "SECOND"
}

type StudentProfile = { id: string; levelId: string; fullName: string }

type ApiResponse<T> = {
  success: boolean
  data: T | null
  message: string
  errors?: { field: string; message: string }[]
}

/** Parse "2025/2026 First Semester" → "FIRST" | "SECOND" | null */
function parseSemester(sessionName: string): "FIRST" | "SECOND" | null {
  if (sessionName.includes("First")) return "FIRST"
  if (sessionName.includes("Second")) return "SECOND"
  return null
}

function CoursesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const session = searchParams.get("session") ?? ""
  const semester = parseSemester(session)

  const [courses, setCourses] = useState<Course[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Courses visible for the current session's semester
  const visibleCourses = semester
    ? courses.filter((c) => c.semester === semester)
    : courses

  useEffect(() => {
    async function loadCourses() {
      // level_id from URL (passed by register page) — no auth needed for course list
      const levelId = searchParams.get("level_id")

      let loaded: Course[] = []

      if (!levelId) {
        // Fallback: fetch from profile (student must be logged in)
        try {
          const profileRes = await fetch("/api/students/me")
          if (!profileRes.ok) {
            toast.error("Could not load your profile. Please sign in again.")
            router.push("/login")
            return
          }
          const profileJson: ApiResponse<StudentProfile> = await profileRes.json()
          if (!profileJson.success || !profileJson.data) {
            toast.error("Could not load your profile. Please sign in again.")
            router.push("/login")
            return
          }
          const res = await fetch(`/api/courses?level_id=${encodeURIComponent(profileJson.data.levelId)}`)
          const json: ApiResponse<Course[]> = await res.json()
          if (json.success && json.data) loaded = json.data
          else toast.error("Could not load courses.")
        } catch {
          toast.error("Something went wrong loading your courses.")
        } finally {
          setLoading(false)
        }
      } else {
        try {
          const res = await fetch(`/api/courses?level_id=${encodeURIComponent(levelId)}`)
          const json: ApiResponse<Course[]> = await res.json()
          if (json.success && json.data) {
            loaded = json.data
          } else {
            toast.error("Could not load courses.")
          }
        } catch {
          toast.error("Something went wrong loading your courses.")
        } finally {
          setLoading(false)
        }
      }

      if (loaded.length > 0) {
        setCourses(loaded)
        // Auto-select all courses for the current session's semester.
        // Students are expected to take all courses at their level — they can uncheck electives.
        const sem = parseSemester(session)
        const toSelect = sem ? loaded.filter((c) => c.semester === sem) : loaded
        setSelectedIds(new Set(toSelect.map((c) => c.id)))
      }
    }

    loadCourses()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, searchParams])

  function toggleCourse(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  async function handleEnroll() {
    if (selectedIds.size === 0) return
    if (!session) {
      toast.error("Session not found. Please restart registration.")
      router.push("/register")
      return
    }

    setSubmitting(true)
    try {
      const results = await Promise.all(
        Array.from(selectedIds).map(async (courseId) => {
          const r = await fetch("/api/enrollments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ courseId, session }),
          })
          const json: ApiResponse<null> = await r.json().catch(() => ({
            success: false,
            data: null,
            message: `Server error (${r.status})`,
          }))
          return json
        })
      )

      const failed = results.filter((r) => !r.success)
      if (failed.length > 0) {
        toast.error(failed[0].message ?? "Some enrollments failed.")
        return
      }

      toast.success("Enrollment complete!")
      router.push("/dashboard")
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-8 w-full max-w-md shadow-sm">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Select Your Courses</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Choose the courses you&apos;re registered for this session
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">{session}</p>
        </div>
        <ThemeToggle />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : visibleCourses.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No courses available for your level.
        </p>
      ) : (
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1 -mr-1">
          {visibleCourses.map((course) => {
            const selected = selectedIds.has(course.id)
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
      )}

      <div className="mt-6 space-y-2">
        {selectedIds.size > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            {selectedIds.size} course{selectedIds.size !== 1 ? "s" : ""} selected
          </p>
        )}
        <Button
          className="w-full"
          disabled={selectedIds.size === 0 || submitting || loading}
          onClick={handleEnroll}
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
    </div>
  )
}

export default function CoursesPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-card border border-border rounded-xl p-8 w-full max-w-md shadow-sm">
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-4 w-64 mb-6" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        </div>
      }
    >
      <CoursesContent />
    </Suspense>
  )
}
