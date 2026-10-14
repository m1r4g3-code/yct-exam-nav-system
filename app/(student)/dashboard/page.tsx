"use client";

import { useState, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarX2,
  CheckCircle2,
  Clock,
  MapPin,
  Navigation,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { QUERY_KEYS } from "@/lib/query-keys";
import { apiGet, errorMessage } from "@/lib/fetcher";
import { useSelectedSession } from "@/hooks/use-selected-session";
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

// ── Time ─────────────────────────────────────────────────────────────────────
// Slot dates arrive as "YYYY-MM-DDT00:00:00.000Z" and times as "1970-01-01THH:MM:00.000Z";
// both carry Lagos wall-clock values in their UTC fields. Lagos (West Africa Time) is
// UTC+1 all year, with no daylight saving.

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** The real instant a slot time is reached on the exam date. */
function slotInstant(dateStr: string, timeStr: string): number {
  const date = new Date(dateStr);
  const time = new Date(timeStr);
  return (
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      time.getUTCHours(),
      time.getUTCMinutes()
    ) - LAGOS_OFFSET_MS
  );
}

const examStartsAt = (e: TimetableEntry) => slotInstant(e.timeSlot.date, e.timeSlot.startTime);
const examEndsAt = (e: TimetableEntry) => slotInstant(e.timeSlot.date, e.timeSlot.endTime);

/** Calendar days from today in Lagos to the exam date (0 = today). */
function daysUntil(dateStr: string, now: number): number {
  const examDay = Math.floor(Date.parse(dateStr) / DAY_MS);
  const lagosToday = Math.floor((now + LAGOS_OFFSET_MS) / DAY_MS);
  return examDay - lagosToday;
}

// A clock that ticks every 30 seconds, so finished exams move to "Completed" and the
// countdown rolls over at midnight without a reload.
const CLOCK_STEP_MS = 30_000;
function subscribeClock(onTick: () => void) {
  const id = window.setInterval(onTick, CLOCK_STEP_MS);
  return () => window.clearInterval(id);
}
const readClock = () => Math.floor(Date.now() / CLOCK_STEP_MS) * CLOCK_STEP_MS;
const readServerClock = () => 0;

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

// ── States ───────────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <div className="space-y-px" aria-busy="true">
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

function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-6 text-center">
      <p className="text-sm font-medium text-destructive">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{message}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function NoSessionState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <CalendarX2 className="size-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
        No exam session is open yet.
      </p>
      <p className="text-xs text-muted-foreground/70 max-w-xs leading-relaxed">
        Your exam timetable will appear here once the exams office publishes it.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <Clock className="size-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
        No exam entries found for this session.
      </p>
      <p className="text-xs text-muted-foreground/70 max-w-xs leading-relaxed">
        Make sure you have{" "}
        <Link href="/courses" className="underline underline-offset-2 hover:text-foreground">
          enrolled in courses
        </Link>{" "}
        for this session, or check back once the timetable is published.
      </p>
    </div>
  );
}

// ── Rows ─────────────────────────────────────────────────────────────────────

function NextExamCard({ entry, now }: { entry: TimetableEntry; now: number }) {
  const assignment = entry.studentAssignments[0];
  const days = daysUntil(entry.timeSlot.date, now);
  const countdownLabel =
    days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;

  return (
    <div className="relative rounded-xl border border-border bg-card overflow-hidden">
      {/* Thin left brand accent */}
      <div className="absolute left-0 inset-y-0 w-[3px] bg-brand" />

      <div className="pl-5 pr-5 pt-4 pb-5 space-y-4">
        {/* Label row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] tracking-[0.12em] uppercase font-medium text-muted-foreground">
              Up Next
            </span>
            <span className="text-[10px] font-mono font-medium text-brand">
              {countdownLabel}
            </span>
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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className="font-medium text-foreground">
              {formatDate(entry.timeSlot.date)}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {formatTime(entry.timeSlot.startTime, entry.timeSlot.endTime)}
            </span>
          </div>
          {assignment?.examHall ? (
            <div className="flex items-center gap-2">
              <MapPin className="size-3.5 text-muted-foreground/70 shrink-0" />
              <span className="text-foreground">{assignment.examHall.name}</span>
              <span className="font-mono text-xs text-muted-foreground">
                ({assignment.examHall.code})
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Hall not assigned yet</p>
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
          <div className="h-9 flex items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
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
          <span className="text-xs text-muted-foreground truncate hidden sm:block">
            {entry.course.title}
          </span>
        </div>
        <p className="text-xs text-muted-foreground sm:hidden mt-0.5 truncate">
          {entry.course.title}
        </p>
        <div className="flex items-center gap-2.5 mt-0.5">
          <span className="text-xs text-muted-foreground">
            {formatDate(entry.timeSlot.date)}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/80">
            {formatTime(entry.timeSlot.startTime, entry.timeSlot.endTime)}
          </span>
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-2">
        {assignment?.examHall ? (
          <>
            {/* Hall and seat belong together: seat numbers start at 1 in every hall */}
            <div className="text-right leading-tight">
              <p className="font-mono text-xs text-foreground/80">{assignment.examHall.code}</p>
              {assignment.seatNumber != null && (
                <p className="font-mono text-[10px] text-muted-foreground tabular-nums">
                  Seat {assignment.seatNumber}
                </p>
              )}
            </div>
            <Button
              render={<Link href={`/navigate/${assignment.examHall.id}`} />}
              nativeButton={false}
              size="icon-sm"
              variant="ghost"
              title="Navigate to hall"
              aria-label={`Navigate to ${assignment.examHall.name}`}
            >
              <Navigation className="size-3.5" />
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground/70">Hall TBD</span>
        )}
      </div>
    </div>
  );
}

function CompletedRow({ entry }: { entry: TimetableEntry }) {
  const assignment = entry.studentAssignments[0];
  return (
    <div className="flex items-center gap-4 py-3 border-b border-border/40 last:border-0 opacity-60">
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
        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
          <span>{formatDate(entry.timeSlot.date)}</span>
          {assignment?.examHall && <span>· {assignment.examHall.code}</span>}
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const {
    session,
    setSession,
    sessions,
    isLoading: sessionsLoading,
    isError: sessionsError,
  } = useSelectedSession();
  const [showCompleted, setShowCompleted] = useState(false);
  const now = useSyncExternalStore(subscribeClock, readClock, readServerClock);

  const timetable = useQuery({
    queryKey: QUERY_KEYS.MY_TIMETABLE(session),
    queryFn: () =>
      apiGet<TimetableEntry[]>(`/api/timetable/me?session=${encodeURIComponent(session)}`),
    enabled: !!session,
  });

  const sorted = useMemo(
    () => [...(timetable.data ?? [])].sort((a, b) => examStartsAt(a) - examStartsAt(b)),
    [timetable.data]
  );

  // An exam counts as completed once it has finished (not merely once its day has started).
  const { upcoming, past } = useMemo(() => {
    const upcoming: TimetableEntry[] = [];
    const past: TimetableEntry[] = [];
    for (const e of sorted) {
      if (examEndsAt(e) <= now) past.push(e);
      else upcoming.push(e);
    }
    return { upcoming, past };
  }, [sorted, now]);

  const nextExam = upcoming[0] ?? null;
  const remainingUpcoming = upcoming.slice(1);

  const missingSeat = upcoming.some(
    (e) => e.studentAssignments[0]?.examHall != null && e.studentAssignments[0]?.seatNumber == null
  );

  let content: React.ReactNode;
  if (sessionsLoading) {
    content = <SkeletonRows />;
  } else if (sessionsError) {
    content = (
      <ErrorState
        title="Failed to load sessions"
        message="Check your connection and try again."
        onRetry={() => queryClient.refetchQueries({ queryKey: QUERY_KEYS.SESSIONS })}
      />
    );
  } else if (!session) {
    content = <NoSessionState />;
  } else if (timetable.isPending) {
    // Skeleton until the timetable has data — never a flash of the empty state.
    content = <SkeletonRows />;
  } else if (timetable.isError) {
    content = (
      <ErrorState
        title="Failed to load timetable"
        message={errorMessage(timetable.error)}
        onRetry={() => timetable.refetch()}
      />
    );
  } else if (sorted.length === 0) {
    content = <EmptyState />;
  } else {
    content = (
      <div className="space-y-7">
        {/* Seat-number pending notice */}
        {missingSeat && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-start gap-2.5">
            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                Seat number not yet assigned
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Your hall is shown, but a seat number hasn&apos;t been assigned yet. Please contact the exams office.
              </p>
            </div>
          </div>
        )}

        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-[2px] rounded-full bg-border overflow-hidden">
            <div
              className="h-full bg-brand transition-all duration-500"
              style={{ width: `${(past.length / sorted.length) * 100}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-muted-foreground tabular-nums shrink-0">
            {past.length} / {sorted.length}
          </span>
          {upcoming.length > 0 && (
            <span className="text-[10px] text-muted-foreground/80 shrink-0">
              {upcoming.length} remaining
            </span>
          )}
        </div>

        {/* Next exam */}
        {nextExam && <NextExamCard entry={nextExam} now={now} />}

        {/* Upcoming */}
        {remainingUpcoming.length > 0 && (
          <div>
            <p className="text-[10px] tracking-[0.12em] uppercase font-medium text-muted-foreground mb-3">
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
              type="button"
              className="flex items-center gap-1.5 text-[10px] tracking-[0.12em] uppercase font-medium text-muted-foreground mb-3 hover:text-foreground transition-colors"
              onClick={() => setShowCompleted((v) => !v)}
              aria-expanded={showCompleted}
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
        {upcoming.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <CheckCircle2 className="size-8 text-brand/70" />
            <p className="text-sm font-medium text-foreground">All exams completed</p>
            <p className="text-xs text-muted-foreground">Great work this semester.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 pt-6 pb-28 md:pb-8 md:px-8 max-w-xl mx-auto">
      {/* Header */}
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold text-foreground tracking-tight">
            Exam Timetable
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Your scheduled examinations
          </p>
        </div>
        {sessions.length > 0 && (
          <Select value={session || null} onValueChange={(v) => v != null && setSession(v)}>
            <SelectTrigger className="w-auto h-7 text-xs px-2.5 shrink-0" aria-label="Session">
              <SelectValue>{session}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {sessions.map((s) => (
                <SelectItem key={s.id} value={s.name} className="text-xs">
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {content}
    </div>
  );
}
