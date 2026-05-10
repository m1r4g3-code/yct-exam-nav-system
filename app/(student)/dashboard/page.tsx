"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Clock, Navigation, MapPin } from "lucide-react";
import { QUERY_KEYS } from "@/lib/query-keys";
import { VALID_SESSIONS, DEFAULT_SESSION } from "@/lib/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface ExamHall {
  id: string;
  name: string;
  code: string;
  latitude: number;
  longitude: number;
}

interface StudentAssignment {
  seatNumber: number | null;
  examHall: ExamHall | null;
}

interface TimetableEntry {
  id: string;
  course: { id: string; code: string; title: string; creditUnits: number };
  timeSlot: { date: string; startTime: string; endTime: string; label: string };
  studentAssignments: StudentAssignment[];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(start: string, end: string): string {
  return `${start} – ${end}`;
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="border-t border-zinc-800">
          {Array.from({ length: 6 }).map((__, j) => (
            <td key={j} className="px-4 py-3">
              <Skeleton className="h-4 w-full bg-zinc-800" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function CardSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3"
        >
          <Skeleton className="h-5 w-32 bg-zinc-800" />
          <Skeleton className="h-4 w-full bg-zinc-800" />
          <Skeleton className="h-4 w-2/3 bg-zinc-800" />
          <Skeleton className="h-10 w-full bg-zinc-800 mt-1 rounded-xl" />
        </div>
      ))}
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <Clock className="size-10 text-zinc-600" />
      <p className="text-zinc-400 text-sm max-w-xs">
        Exam timetable not yet published. Check back later.
      </p>
    </div>
  );
}

export default function DashboardPage() {
  const [session, setSession] = useState<string>(DEFAULT_SESSION);

  const { data: entries = [], isLoading } = useQuery<TimetableEntry[]>({
    queryKey: QUERY_KEYS.MY_TIMETABLE(session),
    queryFn: async () => {
      const res = await fetch(
        `/api/timetable/me?session=${encodeURIComponent(session)}`
      );
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: !!session,
  });

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-6 md:px-8 md:py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-50">Exam Timetable</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Your scheduled examinations</p>
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

      {/* ── Desktop table ─────────────────────────────────────────────── */}
      <div className="hidden md:block rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Course</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Date</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Time</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Hall</th>
              <th className="text-left px-4 py-3 text-zinc-400 font-medium">Seat</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <TableSkeleton />
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center">
                  <EmptyState />
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const assignment = entry.studentAssignments[0];
                return (
                  <tr
                    key={entry.id}
                    className="border-t border-zinc-800 hover:bg-zinc-800/40 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-mono font-semibold text-zinc-50">{entry.course.code}</p>
                      <p className="text-zinc-400 text-xs mt-0.5 max-w-[220px] leading-snug">{entry.course.title}</p>
                    </td>
                    <td className="px-4 py-3 text-zinc-300 whitespace-nowrap">
                      {formatDate(entry.timeSlot.date)}
                    </td>
                    <td className="px-4 py-3 font-mono text-zinc-300 whitespace-nowrap">
                      {formatTime(entry.timeSlot.startTime, entry.timeSlot.endTime)}
                    </td>
                    <td className="px-4 py-3">
                      {assignment?.examHall ? (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="size-3.5 text-indigo-400 shrink-0" />
                          <span className="text-zinc-300">{assignment.examHall.name}</span>
                        </div>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {assignment?.seatNumber != null ? (
                        <Badge className="bg-zinc-800 text-zinc-300 border-zinc-700 font-mono">
                          {assignment.seatNumber}
                        </Badge>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {assignment?.examHall?.id ? (
                        <Button
                          render={<Link href={`/navigate/${assignment.examHall.id}`} />}
                          nativeButton={false}
                          size="sm"
                          className="bg-indigo-600 hover:bg-indigo-500 text-white border-0"
                        >
                          <Navigation className="size-3.5 mr-1.5" />
                          Navigate me
                        </Button>
                      ) : (
                        <span className="text-zinc-600 text-xs">Not assigned</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Mobile cards ──────────────────────────────────────────────── */}
      <div className="flex md:hidden flex-col gap-3">
        {isLoading ? (
          <CardSkeleton />
        ) : entries.length === 0 ? (
          <EmptyState />
        ) : (
          entries.map((entry) => {
            const assignment = entry.studentAssignments[0];
            return (
              <div
                key={entry.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-900 overflow-hidden"
              >
                {/* Card header */}
                <div className="px-4 pt-4 pb-3 border-b border-zinc-800/60">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="font-mono font-bold text-zinc-50 text-base">
                        {entry.course.code}
                      </span>
                      <p className="text-sm text-zinc-300 mt-0.5 leading-snug">
                        {entry.course.title}
                      </p>
                    </div>
                    {assignment?.seatNumber != null && (
                      <Badge className="shrink-0 bg-zinc-800 text-zinc-300 border-zinc-700 font-mono">
                        Seat {assignment.seatNumber}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Card body */}
                <div className="px-4 py-3 space-y-2">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                    <span className="font-medium text-zinc-300">{formatDate(entry.timeSlot.date)}</span>
                    <span>{formatTime(entry.timeSlot.startTime, entry.timeSlot.endTime)}</span>
                  </div>

                  {assignment?.examHall ? (
                    <div className="flex items-center gap-1.5 text-sm text-zinc-300">
                      <MapPin className="size-3.5 text-indigo-400 shrink-0" />
                      <span className="font-medium">{assignment.examHall.name}</span>
                      <span className="text-zinc-500 font-mono text-xs">({assignment.examHall.code})</span>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500">Hall not assigned yet</p>
                  )}
                </div>

                {/* Navigate button */}
                {assignment?.examHall?.id && (
                  <div className="px-4 pb-4">
                    <Button
                      render={<Link href={`/navigate/${assignment.examHall.id}`} />}
                      nativeButton={false}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white border-0 h-10 rounded-xl"
                    >
                      <Navigation className="size-4 mr-2" />
                      Navigate me
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
