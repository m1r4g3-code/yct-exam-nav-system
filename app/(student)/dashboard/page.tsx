"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, MapPin, Navigation, ChevronDown, ChevronUp } from "lucide-react";
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

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <Skeleton className="h-5 w-28" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-10 w-full rounded-lg mt-2" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <Clock className="size-10 text-muted-foreground/40" />
      <p className="text-muted-foreground text-sm max-w-xs">
        No published exam timetable for this session yet. Check back later.
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
    <div className="rounded-xl border border-border bg-card overflow-hidden ring-1 ring-border">
      {/* Brand accent stripe */}
      <div className="h-1 w-full bg-brand" />
      <div className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
            Up Next
          </span>
          {countdownLabel && (
            <span className="text-[10px] font-mono font-medium text-brand bg-brand/10 px-1.5 py-0.5 rounded-full">
              {countdownLabel}
            </span>
          )}
        </div>
        {assignment?.seatNumber != null && (
          <Badge className="font-mono text-xs">
            Seat {assignment.seatNumber}
          </Badge>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-mono font-bold text-foreground text-xl leading-tight">
          {entry.course.code}
        </p>
        <p className="text-sm text-muted-foreground mt-1 leading-snug">
          {entry.course.title}
        </p>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <span className="font-medium text-foreground">{formatDate(entry.timeSlot.date)}</span>
        <span className="text-muted-foreground font-mono">
          {formatTime(entry.timeSlot.startTime, entry.timeSlot.endTime)}
        </span>
      </div>
      {assignment?.examHall ? (
        <div className="flex items-center gap-2 text-sm text-foreground">
          <MapPin className="size-4 text-muted-foreground shrink-0" />
          <span className="font-medium">{assignment.examHall.name}</span>
          <span className="text-muted-foreground font-mono text-xs">({assignment.examHall.code})</span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Hall not assigned yet</p>
      )}
      {assignment?.examHall?.id ? (
        <Button
          render={<Link href={`/navigate/${assignment.examHall.id}`} />}
          nativeButton={false}
          className="w-full h-10"
        >
          <Navigation className="size-4 mr-2" />
          Navigate to Hall
        </Button>
      ) : (
        <div className="h-10 flex items-center justify-center rounded-lg bg-muted/50 text-sm text-muted-foreground border border-dashed border-border">
          Hall not assigned — check back later
        </div>
      )}
      </div>
    </div>
  );
}

function UpcomingRow({ entry }: { entry: TimetableEntry }) {
  const assignment = entry.studentAssignments[0];
  return (
    <div className="flex items-center gap-4 py-3 px-4 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-semibold text-foreground text-sm">{entry.course.code}</span>
          <span className="text-xs text-muted-foreground truncate hidden sm:block">{entry.course.title}</span>
        </div>
        <p className="text-xs text-muted-foreground sm:hidden mt-0.5 truncate">{entry.course.title}</p>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span>{formatDate(entry.timeSlot.date)}</span>
          <span className="font-mono">{formatTime(entry.timeSlot.startTime, entry.timeSlot.endTime)}</span>
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {assignment?.examHall ? (
          <>
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              <span>{assignment.examHall.name}</span>
            </div>
            {assignment.seatNumber != null && (
              <Badge className="font-mono text-xs">{assignment.seatNumber}</Badge>
            )}
            <Button
              render={<Link href={`/navigate/${assignment.examHall.id}`} />}
              nativeButton={false}
              size="sm"
              variant="outline"
            >
              <Navigation className="size-3 mr-1" />
              Go
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground/60">TBD</span>
        )}
      </div>
    </div>
  );
}

function CompletedRow({ entry }: { entry: TimetableEntry }) {
  const assignment = entry.studentAssignments[0];
  return (
    <div className="flex items-center gap-4 py-3 px-4 border-b border-border last:border-0 opacity-60">
      <CheckCircle2 className="size-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-foreground text-sm line-through decoration-muted-foreground/40">
            {entry.course.code}
          </span>
          <span className="text-xs text-muted-foreground truncate hidden sm:block">{entry.course.title}</span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
          <span>{formatDate(entry.timeSlot.date)}</span>
          {assignment?.examHall && <span>{assignment.examHall.name}</span>}
        </div>
      </div>
      <Badge variant="secondary" className="shrink-0 text-xs">
        Done
      </Badge>
    </div>
  );
}

export default function DashboardPage() {
  const [session, setSession] = useState<string>(DEFAULT_SESSION);
  const [showCompleted, setShowCompleted] = useState(false);

  const { data: entries = [], isLoading } = useQuery<TimetableEntry[]>({
    queryKey: QUERY_KEYS.MY_TIMETABLE(session),
    queryFn: async () => {
      const res = await fetch(`/api/timetable/me?session=${encodeURIComponent(session)}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: !!session,
  });

  const sorted = useMemo(() =>
    [...entries].sort((a, b) => {
      const dateDiff = new Date(a.timeSlot.date).getTime() - new Date(b.timeSlot.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      return new Date(a.timeSlot.startTime).getTime() - new Date(b.timeSlot.startTime).getTime();
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
    <div className="min-h-screen bg-background px-4 pt-6 pb-8 md:px-8 md:pt-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Exam Timetable</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your scheduled examinations</p>
        </div>
        <Select value={session} onValueChange={(v) => v != null && setSession(v)}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VALID_SESSIONS.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          {/* Progress chip */}
          {entries.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 text-brand font-medium px-3 py-1">
                <CheckCircle2 className="size-3" />
                {past.length} of {sorted.length} completed
              </span>
              {upcoming.length > 0 && (
                <span className="text-muted-foreground">{upcoming.length} remaining</span>
              )}
            </div>
          )}

          {/* Next exam */}
          {nextExam && <NextExamCard entry={nextExam} />}

          {/* Upcoming exams */}
          {remainingUpcoming.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                Upcoming ({remainingUpcoming.length})
              </p>
              <div className="rounded-xl border border-border bg-card px-4">
                {remainingUpcoming.map((e) => <UpcomingRow key={e.id} entry={e} />)}
              </div>
            </div>
          )}

          {/* Completed exams */}
          {past.length > 0 && (
            <div>
              <button
                className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 hover:text-foreground transition-colors"
                onClick={() => setShowCompleted((v) => !v)}
              >
                Completed ({past.length})
                {showCompleted ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              </button>
              {showCompleted && (
                <div className="rounded-xl border border-border bg-card px-4">
                  {past.map((e) => <CompletedRow key={e.id} entry={e} />)}
                </div>
              )}
            </div>
          )}

          {/* All done state */}
          {upcoming.length === 0 && past.length > 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CheckCircle2 className="size-10 text-brand" />
              <p className="font-medium text-foreground">All exams completed!</p>
              <p className="text-sm text-muted-foreground">Great work this semester.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
