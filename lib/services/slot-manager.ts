import { prisma } from "@/lib/prisma";

const SLOT_TIMES = [
  { start: "08:00", end: "10:00", label: "Morning" },
  { start: "12:00", end: "14:00", label: "Afternoon" },
] as const;

/**
 * Creates 20 weekday exam slots (Morning + Afternoon) starting from startDateStr.
 * Skips weekends. Uses skipDuplicates so re-running the same date is safe.
 *
 * Before creating slots, deletes all orphaned slots (no timetable entries) that
 * fall within the new date range so stale slots from a prior examStartDate don't
 * clutter the slot picker. Slots outside the new range are untouched.
 */
export async function ensureExamSlots(startDateStr: string): Promise<void> {
  const origin = new Date(startDateStr + "T00:00:00Z");
  const toCreate: { date: Date; startTime: Date; endTime: Date; label: string }[] = [];
  let weekdays = 0;
  let offset = 0;

  while (weekdays < 20) {
    const current = new Date(origin);
    current.setUTCDate(origin.getUTCDate() + offset);
    offset++;
    const dow = current.getUTCDay();
    if (dow === 0 || dow === 6) continue;

    const dateLabel = current.toLocaleDateString("en-NG", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });

    for (const t of SLOT_TIMES) {
      toCreate.push({
        date: current,
        startTime: new Date(`1970-01-01T${t.start}:00Z`),
        endTime: new Date(`1970-01-01T${t.end}:00Z`),
        label: `${dateLabel} ${t.label}`,
      });
    }
    weekdays++;
  }

  // The range spans ~4 calendar weeks to cover 20 weekdays; add a buffer.
  const rangeEnd = new Date(origin);
  rangeEnd.setUTCDate(origin.getUTCDate() + 32);

  await prisma.timeSlot.deleteMany({
    where: {
      timetableEntries: { none: {} },
      date: { gte: origin, lte: rangeEnd },
    },
  });

  await prisma.timeSlot.createMany({ data: toCreate, skipDuplicates: true });
}
