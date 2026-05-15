"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, MapPin, Navigation, ChevronDown, ChevronUp } from "lucide-react";
import { QUERY_KEYS } from "@/lib/query-keys";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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
    timeZone: "UTC",
  });
}

function formatTime(start: string, end: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    const h = d.getUTCHours();
    const m = d.getUTCMinutes();
    const ampm = h >= 12 ? "PM" : "AM";
    return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

function isExamDone(dateStr: string): boolean {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const examDate = new Date(dateStr);
  examDate.setUTCHours(0, 0, 0, 0);
  return examDate < today;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const examDate = new Date(dateStr);
  examDate.setUTCHours(0, 0, 0, 0);
  return Math.round((examDate.getTime() - today.getTime()) / 86_400_000);
}

function SkeletonRows() {
  return (
    <div className="space-y-px">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4 py-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-6 w-16 rounded-md" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <Clock className="size-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground/60 max-w-xs leading-relaxed">
        No published exam timetable for this session yet.
      </p>
    </div>
  );
}

function NextExamCard({ entry }: { entry: TimetableEntry }) {
  const assignment = entry.studentAssignments[0];
  const days = daysUntil(entry.timeSlot.date);
  const countdownLabel =
    days === 0 ? "Today" : days === 1 ? "Tomorrow" : days <= 7 ? `In ${days} days` : null;

  return (
    <div className="relative rounded-xl border border-border bg-card overflow-hidden">
      {/* Thin left brand accent */}
      <div className="absolute left-0 inset-y-0 w-[3px] bg-brand" />

      <div className="pl-5 pr-5 pt-4 pb-5 space-y-4">
        {/* Label row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] tracking-[0.12em] uppercase font-medium text-muted-foreground/60">
              Up Next
            </span>
            {countdownLabel && (
              <span className="text-[10px] font-mono font-medium text-brand">
                {countdownLabel}
              </span>
            )}
          </div>
          {assignment?.seatNumber != null && (
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              Seat {assignment.seatNumber}
            </span>
          )}
        </div>

        {/* Course */}
        <div>
          <p className="font-mono font-bold text-2xl text-foreground tracking-tight leading-none">
            {entry.course.code}
          </p>
          <p className="text-sm text-muted-foreground mt-1.5 leading-snug">
            {entry.course.title}
          </p>
        </div>

        {/* Date + hall */}
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-3">
            <span className="font-medium text-foreground">
              {formatDate(entry.timeSlot.date)}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {formatTime(entry.timeSlot.startTime, entry.timeSlot.endTime)}
            </span>
          </div>
          {assignment?.examHall ? (
            <div className="flex items-center gap-2">
              <MapPin className="size-3.5 text-muted-foreground/50 shrink-0" />
              <span className="text-foreground">{assignment.examHall.name}</span>
              <span className="font-mono text-xs text-muted-foreground/60">
                ({assignment.examHall.code})
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground/60">Hall not assigned yet</p>
          )}
        </div>

        {/* Navigate */}
        {assignment?.examHall?.id ? (
          <Button
            render={<Link href={`/navigate/${assignment.examHall.id}`} />}
            nativeButton={false}
            className="w-full h-9"
          >
            <Navigation className="size-4" />
            Navigate to Hall
          </Button>
        ) : (
          <div className="h-9 flex items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground/60">
            Hall assignment pending
          </div>
        )}
      </div>
    </div>
  );
}

function UpcomingRow({ entry }: { entry: TimetableEntry }) {
  const assignment = entry.studentAssignments[0];
  return (
    <div className="flex items-center gap-4 py-3.5 border-b border-border/60 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-sm font-semibold text-foreground">
            {entry.course.code}
          </span>
          <span className="text-xs text-muted-foreground/80 truncate hidden sm:block">
            {entry.course.title}
          </span>
        </div>
        <p className="text-xs text-muted-foreground/70 sm:hidden mt-0.5 truncate">
          {entry.course.title}
        </p>
        <div className="flex items-center gap-2.5 mt-0.5">
          <span className="text-xs text-muted-foreground/70">
            {formatDate(entry.timeSlot.date)}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/50">
            {formatTime(entry.timeSlot.startTime, entry.timeSlot.endTime)}
          </span>
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-2">
        {assignment?.examHall ? (
          <>
            <span className="font-mono text-xs text-muted-foreground/60 hidden sm:block">
              {assignment.examHall.code}
            </span>
            {assignment.seatNumber != null && (
              <span className="font-mono text-xs text-muted-foreground/80 tabular-nums w-4 text-center">
                {assignment.seatNumber}
              </span>
            )}
            <Button
              render={<Link href={`/navigate/${assignment.examHall.id}`} />}
              nativeButton={false}
              size="icon-sm"
              variant="ghost"
              title="Navigate to hall"
            >
              <Navigation className="size-3.5" />
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground/40">TBD</span>
        )}
      </div>
    </div>
  );
}

function CompletedRow({ entry }: { entry: TimetableEntry }) {
  const assignment = entry.studentAssignments[0];
  return (
    <div className="flex items-center gap-4 py-3 border-b border-border/40 last:border-0 opacity-45">
      <CheckCircle2 className="size-3.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-foreground line-through decoration-muted-foreground/30">
            {entry.course.code}
          </span>
          <span className="text-xs text-muted-foreground truncate hidden sm:block">
            {entry.course.title}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground/70">
          <span>{formatDate(entry.timeSlot.date)}</span>
          {assignment?.examHall && <span>· {assignment.examHall.code}</span>}
        </div>
      </div>
    </div>
  );
}

interface SessionOption { id: string; name: string; isActive: boolean }

export default function DashboardPage() {
  const [session, setSession] = useState<string>("");
  const [showCompleted, setShowCompleted] = useState(false);

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

  // Default to the most recent active session once loaded
  const effectiveSession = session || activeSessions[0]?.name || "";

  const { data: entries = [], isLoading, isError } = useQuery<TimetableEntry[]>({
    queryKey: QUERY_KEYS.MY_TIMETABLE(effectiveSession),
    queryFn: async () => {
      const res = await fetch(`/api/timetable/me?session=${encodeURIComponent(effectiveSession)}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: !!effectiveSession,
  });

  const sorted = useMemo(
    () =>
      [...entries].sort((a, b) => {
        const dateDiff =
          new Date(a.timeSlot.date).getTime() - new Date(b.timeSlot.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return (
          new Date(a.timeSlot.startTime).getTime() -
          new Date(b.timeSlot.startTime).getTime()
        );
      }),
    [entries]
  );

  const { upcoming, past } = useMemo(() => {
    const upcoming: TimetableEntry[] = [];
    const past: TimetableEntry[] = [];
    for (const e of sorted) {
      if (isExamDone(e.timeSlot.date)) past.push(e);
      else upcoming.push(e);
    }
    return { upcoming, past };
  }, [sorted]);

  const nextExam = upcoming[0] ?? null;
  const remainingUpcoming = upcoming.slice(1);

  return (
    <div className="min-h-screen bg-background px-4 pt-6 pb-28 md:pb-8 md:px-8 max-w-xl mx-auto">
      {/* Header */}
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold text-foreground tracking-tight">
            Exam Timetable
          </h1>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            Your scheduled examinations
          </p>
        </div>
        <Select value={effectiveSession} onValueChange={(v) => v != null && setSession(v)}>
          <SelectTrigger className="w-auto h-7 text-xs px-2.5 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {activeSessions.map((s) => (
              <SelectItem key={s.id} value={s.name} className="text-xs">
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <SkeletonRows />
      ) : isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-6 text-center">
          <p className="text-sm font-medium text-destructive">Failed to load timetable</p>
          <p className="text-xs text-muted-foreground mt-1">Check your connection and refresh the page.</p>
        </div>
      ) : entries.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-7">
          {/* Progress bar */}
          {sorted.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="flex-1 h-[2px] rounded-full bg-border overflow-hidden">
                <div
                  className="h-full bg-brand transition-all duration-500"
                  style={{ width: `${(past.length / sorted.length) * 100}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums shrink-0">
                {past.length} / {sorted.length}
              </span>
              {upcoming.length > 0 && (
                <span className="text-[10px] text-muted-foreground/50 shrink-0">
                  {upcoming.length} remaining
                </span>
              )}
            </div>
          )}

          {/* Next exam */}
          {nextExam && <NextExamCard entry={nextExam} />}

          {/* Upcoming */}
          {remainingUpcoming.length > 0 && (
            <div>
              <p className="text-[10px] tracking-[0.12em] uppercase font-medium text-muted-foreground/50 mb-3">
                Upcoming ({remainingUpcoming.length})
              </p>
              <div>
                {remainingUpcoming.map((e) => (
                  <UpcomingRow key={e.id} entry={e} />
                ))}
              </div>
            </div>
          )}

          {/* Completed */}
          {past.length > 0 && (
            <div>
              <button
                className="flex items-center gap-1.5 text-[10px] tracking-[0.12em] uppercase font-medium text-muted-foreground/50 mb-3 hover:text-muted-foreground transition-colors"
                onClick={() => setShowCompleted((v) => !v)}
              >
                Completed ({past.length})
                {showCompleted ? (
                  <ChevronUp className="size-3" />
                ) : (
                  <ChevronDown className="size-3" />
                )}
              </button>
              {showCompleted && (
                <div>
                  {past.map((e) => (
                    <CompletedRow key={e.id} entry={e} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* All done */}
          {upcoming.length === 0 && past.length > 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckCircle2 className="size-8 text-brand/70" />
              <p className="text-sm font-medium text-foreground">All exams completed</p>
              <p className="text-xs text-muted-foreground/60">Great work this semester.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
