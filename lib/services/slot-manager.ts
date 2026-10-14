import { prisma } from "@/lib/prisma";
import { examWindow, planExamSlots } from "./exam-slots";

/**
 * Creates the exam slots for an exam period — Monday to Friday, Morning
 * (08:00–10:00) and Afternoon (12:00–14:00) — and returns the period's first and
 * last day. Slots that already exist (same date and start time) are reused, so
 * re-running for the same dates is safe, and slots an admin added by hand are kept.
 */
export async function ensureExamSlots(
  startDate: string,
  weeks: number
): Promise<{ from: Date; to: Date; created: number }> {
  const planned = planExamSlots(startDate, weeks);
  const { count } = await prisma.timeSlot.createMany({ data: planned, skipDuplicates: true });
  return { ...examWindow(startDate, weeks), created: count };
}
