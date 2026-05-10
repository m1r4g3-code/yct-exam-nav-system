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
import { VALID_SESSIONS, DEFAULT_SESSION } from "@/lib/constants";

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
              <Skeleton className="h-4 w-full bg-zinc-800" />
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
          className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-2"
        >
          <Skeleton className="h-5 w-28 bg-zinc-800" />
          <Skeleton className="h-4 w-full bg-zinc-800" />
          <Skeleton className="h-4 w-1/2 bg-zinc-800" />
        </div>
      ))}
    </>
  );
}

export default function CoursesPage() {
  const [session, setSession] = useState<string>(DEFAULT_SESSION);

  const { data: enrollments = [], isLoading } = useQuery<Enrollment[]>({
    queryKey: QUERY_KEYS.MY_ENROLLMENTS(session),
    queryFn: async () => {
      const res = await fetch(
        `/api/enrollments?session=${encodeURIComponent(session)}`
      );
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: !!session,
  });

  const totalCreditUnits = enrollments.reduce(
    (acc, e) => acc + e.course.creditUnits,
    0
  );

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-6 md:px-8 md:py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-50">My Courses</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            Enrolled courses for the selected session
          </p>
        </div>
        <Select value={session} onValueChange={(v) => v != null && setSession(v)}>
          <SelectTrigger className="w-full sm:w-72 bg-zinc-900 border-zinc-700 text-zinc-50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VALID_SESSIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-400">Code</TableHead>
              <TableHead className="text-zinc-400">Title</TableHead>
              <TableHead className="text-zinc-400">Credits</TableHead>
              <TableHead className="text-zinc-400">Semester</TableHead>
              <TableHead className="text-zinc-400">Level</TableHead>
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
                  className="border-zinc-800 hover:bg-zinc-800/40"
                >
                  <TableCell className="font-mono font-medium text-zinc-50">
                    {e.course.code}
                  </TableCell>
                  <TableCell className="text-zinc-200 max-w-[260px] whitespace-normal">
                    {e.course.title}
                  </TableCell>
                  <TableCell className="text-zinc-300">
                    {e.course.creditUnits}
                  </TableCell>
                  <TableCell className="text-zinc-300">
                    {e.course.semester}
                  </TableCell>
                  <TableCell className="text-zinc-300">
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
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-1"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono font-semibold text-zinc-50 text-base">
                  {e.course.code}
                </span>
                <span className="shrink-0 rounded-md bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                  {e.course.creditUnits} cr
                </span>
              </div>
              <p className="text-sm text-zinc-300 leading-snug">
                {e.course.title}
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500 pt-1">
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
          <span className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-300">
            Total credit units:{" "}
            <span className="font-semibold text-zinc-50">{totalCreditUnits}</span>
          </span>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <BookMarked className="size-10 text-zinc-600" />
      <p className="text-zinc-400 text-sm max-w-xs">
        No courses enrolled for this session.
      </p>
    </div>
  );
}
