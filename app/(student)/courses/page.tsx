"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/query-keys";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BookMarked } from "lucide-react";

interface SessionOption { id: string; name: string; isActive: boolean }

interface Enrollment {
  id: string;
  session: string;
  course: {
    id: string;
    code: string;
    title: string;
    creditUnits: number;
    semester: string;
    level: { name: string };
  };
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 5 }).map((__, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function CardSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-border bg-card p-4 space-y-2"
        >
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </>
  );
}

export default function CoursesPage() {
  const [session, setSession] = useState<string>("");

  const { data: sessions = [] } = useQuery<SessionOption[]>({
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

  const { data: enrollments = [], isLoading } = useQuery<Enrollment[]>({
    queryKey: QUERY_KEYS.MY_ENROLLMENTS(effectiveSession),
    queryFn: async () => {
      const res = await fetch(
        `/api/enrollments?session=${encodeURIComponent(effectiveSession)}`
      );
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: !!effectiveSession,
  });

  const totalCreditUnits = enrollments.reduce(
    (acc, e) => acc + e.course.creditUnits,
    0
  );

  return (
    <div className="min-h-screen bg-background px-4 py-6 md:px-8 md:py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">My Courses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Enrolled courses for the selected session
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
              <TableHead className="text-muted-foreground">Code</TableHead>
              <TableHead className="text-muted-foreground">Title</TableHead>
              <TableHead className="text-muted-foreground">Credits</TableHead>
              <TableHead className="text-muted-foreground">Semester</TableHead>
              <TableHead className="text-muted-foreground">Level</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton />
            ) : enrollments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-16 text-center">
                  <EmptyState />
                </TableCell>
              </TableRow>
            ) : (
              enrollments.map((e) => (
                <TableRow
                  key={e.id}
                  className="border-border hover:bg-muted/40"
                >
                  <TableCell className="font-mono font-medium text-foreground">
                    {e.course.code}
                  </TableCell>
                  <TableCell className="text-foreground/80 max-w-[260px] whitespace-normal">
                    {e.course.title}
                  </TableCell>
                  <TableCell className="text-foreground/80">
                    {e.course.creditUnits}
                  </TableCell>
                  <TableCell className="text-foreground/80">
                    {e.course.semester}
                  </TableCell>
                  <TableCell className="text-foreground/80">
                    {e.course.level.name}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile card list */}
      <div className="flex md:hidden flex-col gap-3">
        {isLoading ? (
          <CardSkeleton />
        ) : enrollments.length === 0 ? (
          <EmptyState />
        ) : (
          enrollments.map((e) => (
            <div
              key={e.id}
              className="rounded-xl border border-border bg-card p-4 space-y-1"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono font-semibold text-foreground text-base">
                  {e.course.code}
                </span>
                <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs text-foreground/80">
                  {e.course.creditUnits} cr
                </span>
              </div>
              <p className="text-sm text-foreground/80 leading-snug">
                {e.course.title}
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground pt-1">
                <span>{e.course.semester}</span>
                <span>{e.course.level.name}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Total credit units footer */}
      {!isLoading && enrollments.length > 0 && (
        <div className="mt-4 flex justify-end">
          <span className="rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground/80">
            Total credit units:{" "}
            <span className="font-semibold text-foreground">{totalCreditUnits}</span>
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
        No courses enrolled for this session.
      </p>
    </div>
  );
}
