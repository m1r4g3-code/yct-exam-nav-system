"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, BookMarked, Plus, X } from "lucide-react";
import { QUERY_KEYS } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

interface SessionOption { id: string; name: string; isActive: boolean }

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

function sessionSemester(name: string): "FIRST" | "SECOND" | null {
  if (name.includes("First")) return "FIRST";
  if (name.includes("Second")) return "SECOND";
  return null;
}

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((__, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function CardSkeletons() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </>
  );
}

export default function CoursesPage() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<string>("");
  const [pendingEnroll, setPendingEnroll] = useState<Set<string>>(new Set());
  const [pendingDrop, setPendingDrop] = useState<Set<string>>(new Set());

  // ── Sessions ──────────────────────────────────────────────────────────────
  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<SessionOption[]>({
    queryKey: QUERY_KEYS.SESSIONS,
    queryFn: async () => {
      const res = await fetch("/api/sessions");
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const activeSessions = sessions.filter((s) => s.isActive);
  const effectiveSession = session || activeSessions[0]?.name || "";

  // ── Student profile (for levelId) ─────────────────────────────────────────
  const { data: profile } = useQuery<StudentProfile>({
    queryKey: ["student", "me"],
    queryFn: async () => {
      const res = await fetch("/api/students/me");
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      return json.data;
    },
    staleTime: 30 * 60 * 1000,
  });

  // ── All courses at the student's level ────────────────────────────────────
  const { data: allCourses = [], isLoading: coursesLoading } = useQuery<Course[]>({
    queryKey: QUERY_KEYS.COURSES(profile?.levelId),
    queryFn: async () => {
      const res = await fetch(`/api/courses?level_id=${encodeURIComponent(profile!.levelId)}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: !!profile?.levelId,
    staleTime: 30 * 60 * 1000,
  });

  // ── Current enrollments for this session ──────────────────────────────────
  const { data: enrollments = [], isLoading: enrollmentsLoading } = useQuery<
    { id: string; courseId: string }[]
  >({
    queryKey: QUERY_KEYS.MY_ENROLLMENTS(effectiveSession),
    queryFn: async () => {
      const res = await fetch(`/api/enrollments?session=${encodeURIComponent(effectiveSession)}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: !!effectiveSession,
  });

  const enrolledIds = useMemo(() => new Set(enrollments.map((e) => e.courseId)), [enrollments]);

  // ── Filter courses to session semester ────────────────────────────────────
  const semester = sessionSemester(effectiveSession);
  const visibleCourses = useMemo(
    () => (semester ? allCourses.filter((c) => c.semester === semester) : allCourses),
    [allCourses, semester]
  );

  const totalEnrolledCredits = useMemo(
    () => visibleCourses
      .filter((c) => enrolledIds.has(c.id))
      .reduce((sum, c) => sum + c.creditUnits, 0),
    [visibleCourses, enrolledIds]
  );

  const isLoading = sessionsLoading || coursesLoading || enrollmentsLoading || !profile;

  // ── Enroll ─────────────────────────────────────────────────────────────────
  const enrollMutation = useMutation({
    mutationFn: async (courseId: string) => {
      const res = await fetch("/api/enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, session: effectiveSession }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Enrollment failed");
    },
    onMutate: (courseId) => {
      setPendingEnroll((s) => new Set(s).add(courseId));
    },
    onSuccess: (_, courseId) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MY_ENROLLMENTS(effectiveSession) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MY_TIMETABLE(effectiveSession) });
      toast.success("Enrolled successfully");
      setPendingEnroll((s) => { const n = new Set(s); n.delete(courseId); return n; });
    },
    onError: (e: Error, courseId) => {
      toast.error(e.message);
      setPendingEnroll((s) => { const n = new Set(s); n.delete(courseId); return n; });
    },
  });

  // ── Drop ───────────────────────────────────────────────────────────────────
  const dropMutation = useMutation({
    mutationFn: async (courseId: string) => {
      const res = await fetch(
        `/api/enrollments/${courseId}?session=${encodeURIComponent(effectiveSession)}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Drop failed");
    },
    onMutate: (courseId) => {
      setPendingDrop((s) => new Set(s).add(courseId));
    },
    onSuccess: (_, courseId) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MY_ENROLLMENTS(effectiveSession) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.MY_TIMETABLE(effectiveSession) });
      toast.success("Course dropped");
      setPendingDrop((s) => { const n = new Set(s); n.delete(courseId); return n; });
    },
    onError: (e: Error, courseId) => {
      toast.error(e.message);
      setPendingDrop((s) => { const n = new Set(s); n.delete(courseId); return n; });
    },
  });

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
        <Select value={effectiveSession} onValueChange={(v) => v != null && setSession(v)}>
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {activeSessions.map((s) => (
              <SelectItem key={s.id} value={s.name}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
              <TableHead className="text-muted-foreground w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <SkeletonRows cols={7} />
            ) : visibleCourses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-16 text-center">
                  <EmptyState />
                </TableCell>
              </TableRow>
            ) : (
              visibleCourses.map((c) => {
                const enrolled = enrolledIds.has(c.id);
                const enrolling = pendingEnroll.has(c.id);
                const dropping = pendingDrop.has(c.id);
                return (
                  <TableRow key={c.id} className="border-border hover:bg-muted/40">
                    <TableCell>
                      {enrolled && (
                        <CheckCircle2 className="size-4 text-brand" />
                      )}
                    </TableCell>
                    <TableCell className="font-mono font-medium text-foreground">
                      {c.code}
                    </TableCell>
                    <TableCell className="text-foreground/80 max-w-[260px] whitespace-normal">
                      {c.title}
                    </TableCell>
                    <TableCell className="text-foreground/80">{c.creditUnits}</TableCell>
                    <TableCell className="text-foreground/80 capitalize">
                      {c.semester === "FIRST" ? "First" : "Second"}
                    </TableCell>
                    <TableCell className="text-foreground/80">{c.level.name}</TableCell>
                    <TableCell className="text-right">
                      {enrolled ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive/70 hover:text-destructive h-7 px-2"
                          onClick={() => dropMutation.mutate(c.id)}
                          disabled={dropping}
                        >
                          <X className="size-3.5 mr-1" />
                          {dropping ? "Dropping…" : "Drop"}
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-brand/80 hover:text-brand h-7 px-2"
                          onClick={() => enrollMutation.mutate(c.id)}
                          disabled={enrolling}
                        >
                          <Plus className="size-3.5 mr-1" />
                          {enrolling ? "Enrolling…" : "Enroll"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile card list */}
      <div className="flex md:hidden flex-col gap-3">
        {isLoading ? (
          <CardSkeletons />
        ) : visibleCourses.length === 0 ? (
          <EmptyState />
        ) : (
          visibleCourses.map((c) => {
            const enrolled = enrolledIds.has(c.id);
            const enrolling = pendingEnroll.has(c.id);
            const dropping = pendingDrop.has(c.id);
            return (
              <div
                key={c.id}
                className={`rounded-xl border bg-card p-4 space-y-1 ${
                  enrolled ? "border-brand/30" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {enrolled && <CheckCircle2 className="size-3.5 text-brand shrink-0" />}
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
                    <span>{c.level.name}</span>
                  </div>
                  {enrolled ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive/70 hover:text-destructive h-7 px-2 text-xs"
                      onClick={() => dropMutation.mutate(c.id)}
                      disabled={dropping}
                    >
                      <X className="size-3 mr-1" />
                      {dropping ? "Dropping…" : "Drop"}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-brand/80 hover:text-brand h-7 px-2 text-xs"
                      onClick={() => enrollMutation.mutate(c.id)}
                      disabled={enrolling}
                    >
                      <Plus className="size-3 mr-1" />
                      {enrolling ? "Enrolling…" : "Enroll"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Credit units summary */}
      {!isLoading && visibleCourses.length > 0 && (
        <div className="mt-4 flex justify-end gap-4">
          <span className="rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground/80">
            Enrolled:{" "}
            <span className="font-semibold text-foreground">
              {enrolledIds.size} / {visibleCourses.length}
            </span>{" "}
            courses
          </span>
          <span className="rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground/80">
            Total credits:{" "}
            <span className="font-semibold text-foreground">{totalEnrolledCredits}</span>
          </span>
        </div>
      )}
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
