"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarX2, CheckCircle2, BookMarked, Loader2, Lock, Plus, X } from "lucide-react";
import { QUERY_KEYS } from "@/lib/query-keys";
import { apiGet, apiSend, errorMessage } from "@/lib/fetcher";
import { sessionSemester } from "@/lib/sessions";
import { useSelectedSession } from "@/hooks/use-selected-session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface StudentProfile {
  levelId: string;
  level: { id: string; name: string };
}

interface Course {
  id: string;
  code: string;
  title: string;
  creditUnits: number;
  semester: "FIRST" | "SECOND";
  level: { name: string };
}

interface Enrollment {
  id: string;
  courseId: string;
  session: string;
  /** The course's timetable is published — it can no longer be dropped. */
  locked: boolean;
  course: Course;
}

type EnrollVars = { courseId: string; session: string };

function CardSkeletons() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-8 text-center">
      <p className="text-sm font-medium text-destructive">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{message}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function LockedBadge() {
  return (
    <Badge
      variant="outline"
      className="border-border text-muted-foreground"
      title="Timetable published"
    >
      <Lock />
      Locked
    </Badge>
  );
}

export default function CoursesPage() {
  const queryClient = useQueryClient();
  const {
    session,
    setSession,
    sessions,
    isLoading: sessionsLoading,
    isError: sessionsError,
  } = useSelectedSession();
  const [pendingEnroll, setPendingEnroll] = useState<Set<string>>(new Set());
  const [pendingDrop, setPendingDrop] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<Course | null>(null);
  const [dropOpen, setDropOpen] = useState(false);

  // ── Student profile (for levelId) ─────────────────────────────────────────
  const profileQuery = useQuery({
    queryKey: QUERY_KEYS.STUDENT("me"),
    queryFn: () => apiGet<StudentProfile>("/api/students/me"),
    staleTime: 30 * 60 * 1000,
  });
  const levelId = profileQuery.data?.levelId;

  // ── All courses at the student's level ────────────────────────────────────
  const coursesQuery = useQuery({
    queryKey: QUERY_KEYS.COURSES(levelId),
    queryFn: () => apiGet<Course[]>(`/api/courses?level_id=${encodeURIComponent(levelId!)}`),
    enabled: !!levelId,
    staleTime: 30 * 60 * 1000,
  });

  // ── Current enrollments for this session ──────────────────────────────────
  const enrollmentsQuery = useQuery({
    queryKey: QUERY_KEYS.MY_ENROLLMENTS(session),
    queryFn: () => apiGet<Enrollment[]>(`/api/enrollments?session=${encodeURIComponent(session)}`),
    enabled: !!session,
  });

  const enrollments = useMemo(
    () => new Map((enrollmentsQuery.data ?? []).map((e) => [e.courseId, e])),
    [enrollmentsQuery.data]
  );

  // ── Courses for the session's semester, plus anything else already enrolled ──
  const semester = sessionSemester(session);
  const rows = useMemo(() => {
    const all = coursesQuery.data ?? [];
    const levelCourses = semester ? all.filter((c) => c.semester === semester) : all;
    const listed = new Set(levelCourses.map((c) => c.id));
    const others = (enrollmentsQuery.data ?? [])
      .filter((e) => !listed.has(e.courseId))
      .map((e) => e.course);
    return [...levelCourses, ...others];
  }, [coursesQuery.data, enrollmentsQuery.data, semester]);

  const enrolledRows = rows.filter((c) => enrollments.has(c.id));
  const totalEnrolledCredits = enrolledRows.reduce((sum, c) => sum + c.creditUnits, 0);

  const refreshSession = (forSession: string) => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MY_ENROLLMENTS(forSession) });
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MY_TIMETABLE(forSession) });
  };

  // ── Enroll ─────────────────────────────────────────────────────────────────
  const enrollMutation = useMutation({
    mutationFn: ({ courseId, session }: EnrollVars) =>
      apiSend("/api/enrollments", "POST", { courseId, session }),
    onMutate: ({ courseId }) => {
      setPendingEnroll((s) => new Set(s).add(courseId));
    },
    onSuccess: ({ message }, { session }) => {
      refreshSession(session);
      toast.success(message || "Enrolled successfully");
    },
    onError: (err) => toast.error(errorMessage(err)),
    onSettled: (_data, _err, { courseId }) => {
      setPendingEnroll((s) => { const n = new Set(s); n.delete(courseId); return n; });
    },
  });

  // ── Drop ───────────────────────────────────────────────────────────────────
  const dropMutation = useMutation({
    mutationFn: ({ courseId, session }: EnrollVars) =>
      apiSend(
        `/api/enrollments/${encodeURIComponent(courseId)}?session=${encodeURIComponent(session)}`,
        "DELETE"
      ),
    onMutate: ({ courseId }) => {
      setPendingDrop((s) => new Set(s).add(courseId));
    },
    onSuccess: ({ message }, { session }) => {
      refreshSession(session);
      toast.success(message || "Course dropped");
      setDropOpen(false);
    },
    onError: (err) => toast.error(errorMessage(err)),
    onSettled: (_data, _err, { courseId }) => {
      setPendingDrop((s) => { const n = new Set(s); n.delete(courseId); return n; });
    },
  });

  function askDrop(course: Course) {
    setDropTarget(course);
    setDropOpen(true);
  }

  // ── Page state ─────────────────────────────────────────────────────────────
  let state: React.ReactNode = null;
  if (sessionsLoading) {
    state = <CardSkeletons />;
  } else if (sessionsError) {
    state = (
      <ErrorState
        title="Failed to load sessions"
        message="Check your connection and try again."
        onRetry={() => queryClient.refetchQueries({ queryKey: QUERY_KEYS.SESSIONS })}
      />
    );
  } else if (!session) {
    state = (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <CalendarX2 className="size-10 text-muted-foreground/60" />
        <p className="text-sm font-medium text-foreground">Course registration isn&apos;t open yet</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          You can enrol in courses once the exams office opens a session.
        </p>
      </div>
    );
  } else if (profileQuery.isError) {
    state = (
      <ErrorState
        title="Failed to load your profile"
        message={errorMessage(profileQuery.error)}
        onRetry={() => profileQuery.refetch()}
      />
    );
  } else if (coursesQuery.isError) {
    state = (
      <ErrorState
        title="Failed to load courses"
        message={errorMessage(coursesQuery.error)}
        onRetry={() => coursesQuery.refetch()}
      />
    );
  } else if (enrollmentsQuery.isError) {
    state = (
      <ErrorState
        title="Failed to load your enrollments"
        message={errorMessage(enrollmentsQuery.error)}
        onRetry={() => enrollmentsQuery.refetch()}
      />
    );
  } else if (
    profileQuery.isPending ||
    (!!levelId && coursesQuery.isPending) ||
    enrollmentsQuery.isPending
  ) {
    state = <CardSkeletons />;
  } else if (rows.length === 0) {
    state = <EmptyState />;
  }

  function actionFor(c: Course, compact: boolean) {
    const enrollment = enrollments.get(c.id);
    if (enrollment?.locked) return <LockedBadge />;
    if (enrollment) {
      const dropping = pendingDrop.has(c.id);
      return (
        <Button
          variant="ghost"
          size="sm"
          className={`text-destructive/80 hover:text-destructive h-7 px-2 ${compact ? "text-xs" : ""}`}
          onClick={() => askDrop(c)}
          disabled={dropping}
        >
          <X className={compact ? "size-3 mr-1" : "size-3.5 mr-1"} />
          {dropping ? "Dropping…" : "Drop"}
        </Button>
      );
    }
    const enrolling = pendingEnroll.has(c.id);
    return (
      <Button
        variant="ghost"
        size="sm"
        className={`text-brand hover:text-brand h-7 px-2 ${compact ? "text-xs" : ""}`}
        onClick={() => enrollMutation.mutate({ courseId: c.id, session })}
        disabled={enrolling}
      >
        <Plus className={compact ? "size-3 mr-1" : "size-3.5 mr-1"} />
        {enrolling ? "Enrolling…" : "Enroll"}
      </Button>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-6 md:px-8 md:py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">My Courses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Enroll in courses for the selected session
          </p>
        </div>
        {sessions.length > 0 && (
          <Select value={session || null} onValueChange={(v) => v != null && setSession(v)}>
            <SelectTrigger className="w-full sm:w-72" aria-label="Session">
              <SelectValue>{session}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {sessions.map((s) => (
                <SelectItem key={s.id} value={s.name}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {state ?? (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-xl border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground w-8"></TableHead>
                  <TableHead className="text-muted-foreground">Code</TableHead>
                  <TableHead className="text-muted-foreground">Title</TableHead>
                  <TableHead className="text-muted-foreground">Credits</TableHead>
                  <TableHead className="text-muted-foreground">Semester</TableHead>
                  <TableHead className="text-muted-foreground">Level</TableHead>
                  <TableHead className="text-muted-foreground w-28"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id} className="border-border hover:bg-muted/40">
                    <TableCell>
                      {enrollments.has(c.id) && (
                        <CheckCircle2 className="size-4 text-brand" aria-label="Enrolled" />
                      )}
                    </TableCell>
                    <TableCell className="font-mono font-medium text-foreground">
                      {c.code}
                    </TableCell>
                    <TableCell className="text-foreground/80 max-w-[260px] whitespace-normal">
                      {c.title}
                    </TableCell>
                    <TableCell className="text-foreground/80">{c.creditUnits}</TableCell>
                    <TableCell className="text-foreground/80">
                      {c.semester === "FIRST" ? "First" : "Second"}
                    </TableCell>
                    <TableCell className="text-foreground/80">{c.level?.name ?? "—"}</TableCell>
                    <TableCell className="text-right">{actionFor(c, false)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile card list */}
          <div className="flex md:hidden flex-col gap-3">
            {rows.map((c) => {
              const enrolled = enrollments.has(c.id);
              return (
                <div
                  key={c.id}
                  className={`rounded-xl border bg-card p-4 space-y-1 ${
                    enrolled ? "border-brand/30" : "border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {enrolled && <CheckCircle2 className="size-3.5 text-brand shrink-0" aria-label="Enrolled" />}
                      <span className="font-mono font-semibold text-foreground text-base">
                        {c.code}
                      </span>
                    </div>
                    <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-foreground/80">
                      {c.creditUnits} cr
                    </span>
                  </div>
                  <p className="text-sm text-foreground/80 leading-snug">{c.title}</p>
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{c.semester === "FIRST" ? "First" : "Second"} Semester</span>
                      <span>{c.level?.name}</span>
                    </div>
                    {actionFor(c, true)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Credit units summary */}
          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <span className="rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground/80">
              Enrolled:{" "}
              <span className="font-semibold text-foreground">
                {enrolledRows.length} / {rows.length}
              </span>{" "}
              courses
            </span>
            <span className="rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground/80">
              Total credits:{" "}
              <span className="font-semibold text-foreground">{totalEnrolledCredits}</span>
            </span>
          </div>
        </>
      )}

      {/* Drop confirmation */}
      <Dialog open={dropOpen} onOpenChange={(open) => { if (!dropMutation.isPending) setDropOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Drop {dropTarget?.code}?</DialogTitle>
            <DialogDescription>
              You can enrol again later, until the timetable is published.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDropOpen(false)}
              disabled={dropMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => dropTarget && dropMutation.mutate({ courseId: dropTarget.id, session })}
              disabled={dropMutation.isPending}
            >
              {dropMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Drop course
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <BookMarked className="size-10 text-muted-foreground/70" />
      <p className="text-muted-foreground text-sm max-w-xs">
        No courses available for this session.
      </p>
    </div>
  );
}
