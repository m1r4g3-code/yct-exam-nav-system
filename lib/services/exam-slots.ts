/**
 * Pure planning of exam time slots — no database access, so it can be unit tested.
 *
 * An exam period runs Monday–Friday with two papers a day. Times are stored as
 * TIME values on 1970-01-01 and represent Lagos wall-clock times.
 */

export const EXAM_SLOT_TIMES = [
  { start: "08:00", end: "10:00", label: "Morning" },
  { start: "12:00", end: "14:00", label: "Afternoon" },
] as const;

export const DEFAULT_EXAM_WEEKS = 2;
export const MAX_EXAM_WEEKS = 6;

export interface PlannedSlot {
  date: Date;
  startTime: Date;
  endTime: Date;
  label: string;
}

function parseStartDate(startDate: string): Date {
  const origin = new Date(`${startDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(origin.getTime())) {
    throw new Error(`Invalid exam start date: "${startDate}" (expected YYYY-MM-DD)`);
  }
  return origin;
}

/** The weekdays (as UTC-midnight dates) of an exam period of `weeks` weeks starting on `startDate`. */
export function examWeekdays(startDate: string, weeks: number): Date[] {
  const origin = parseStartDate(startDate);
  const total = Math.max(1, Math.floor(weeks)) * 5;
  const days: Date[] = [];
  for (let offset = 0; days.length < total; offset++) {
    const day = new Date(origin);
    day.setUTCDate(origin.getUTCDate() + offset);
    const dow = day.getUTCDay();
    if (dow !== 0 && dow !== 6) days.push(day);
  }
  return days;
}

/** Every slot (two per weekday) of the exam period, in chronological order. */
export function planExamSlots(startDate: string, weeks: number): PlannedSlot[] {
  return examWeekdays(startDate, weeks).flatMap((day) => {
    const dateLabel = day.toLocaleDateString("en-NG", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    return EXAM_SLOT_TIMES.map((t) => ({
      date: day,
      startTime: new Date(`1970-01-01T${t.start}:00Z`),
      endTime: new Date(`1970-01-01T${t.end}:00Z`),
      label: `${dateLabel} ${t.label}`,
    }));
  });
}

/** First and last calendar day of the exam period (inclusive). */
export function examWindow(startDate: string, weeks: number): { from: Date; to: Date } {
  const days = examWeekdays(startDate, weeks);
  return { from: parseStartDate(startDate), to: days[days.length - 1] };
}

export interface TimedSlot {
  id: string;
  date: Date | string;
  startTime: Date | string;
  endTime: Date | string;
}

const dayKey = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const ms = (d: Date | string) => new Date(d).getTime();

/** True when two slots are on the same day and their times overlap. */
export function slotsOverlap(a: TimedSlot, b: TimedSlot): boolean {
  return (
    dayKey(a.date) === dayKey(b.date) &&
    ms(a.startTime) < ms(b.endTime) &&
    ms(b.startTime) < ms(a.endTime)
  );
}

/**
 * Keeps slots that don't overlap each other, earliest start first. A slot an admin
 * added by hand that overlaps a standard slot is left out, so the scheduler never
 * places two papers at overlapping times as if they were separate slots.
 */
export function withoutOverlaps<T extends TimedSlot>(slots: readonly T[]): T[] {
  const sorted = [...slots].sort(
    (a, b) => ms(a.date) - ms(b.date) || ms(a.startTime) - ms(b.startTime) || ms(a.endTime) - ms(b.endTime)
  );
  const kept: T[] = [];
  for (const slot of sorted) {
    if (!kept.some((k) => slotsOverlap(k, slot))) kept.push(slot);
  }
  return kept;
}

/**
 * Halls already booked at the time of each kept slot: a booking in any slot that
 * overlaps it counts (normally that is the same slot).
 */
export function occupancyBySlot(
  keptSlots: readonly TimedSlot[],
  allSlots: readonly TimedSlot[],
  bookings: readonly { slotId: string; hallId: string }[]
): Map<string, Set<string>> {
  const slotById = new Map(allSlots.map((s) => [s.id, s]));
  const occupied = new Map<string, Set<string>>();
  for (const booking of bookings) {
    const bookedSlot = slotById.get(booking.slotId);
    if (!bookedSlot) continue;
    for (const slot of keptSlots) {
      if (slot.id === bookedSlot.id || slotsOverlap(slot, bookedSlot)) {
        const halls = occupied.get(slot.id) ?? new Set<string>();
        halls.add(booking.hallId);
        occupied.set(slot.id, halls);
      }
    }
  }
  return occupied;
}

/** Postgres advisory-lock key serialising every write of hall bookings (generate, Edit Slot). */
export const HALL_BOOKING_LOCK_KEY = 7_420_026;
