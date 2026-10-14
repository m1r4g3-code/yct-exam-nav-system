import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, notFound, conflict, zodErrors } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import { z } from "zod";
import type { RouteContext } from "@/lib/route-types";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const updateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").optional(),
  startTime: z.string().regex(TIME, "Time must be HH:MM").optional(),
  endTime: z.string().regex(TIME, "Time must be HH:MM").optional(),
  label: z.string().trim().min(2).max(100).optional(),
});

const toTime = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);
const hhmm = (d: Date) => d.toISOString().slice(11, 16);

export const GET = withHandler(async (_req: Request, ctx: RouteContext<"/api/slots/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const slot = await prisma.timeSlot.findUnique({ where: { id } });
  if (!slot) return notFound("Time slot not found");
  return ok(slot);
});

export const PUT = withHandler(async (request: Request, ctx: RouteContext<"/api/slots/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (body === null) return badRequest("Invalid or missing JSON body");
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", zodErrors(parsed.error.issues));

  const existing = await prisma.timeSlot.findUnique({ where: { id } });
  if (!existing) return notFound("Time slot not found");

  const date = parsed.data.date ?? existing.date.toISOString().slice(0, 10);
  const start = parsed.data.startTime ?? hhmm(existing.startTime);
  const end = parsed.data.endTime ?? hhmm(existing.endTime);
  if (end <= start) return badRequest("End time must be after start time");

  const timingChanged =
    date !== existing.date.toISOString().slice(0, 10) ||
    start !== hhmm(existing.startTime) ||
    end !== hhmm(existing.endTime);

  if (timingChanged) {
    // Exams already published in this slot keep their announced date and time.
    const published = await prisma.timetableEntry.count({ where: { timeSlotId: id, status: "PUBLISHED" } });
    if (published > 0)
      return conflict("Published exams use this slot, so its date and time can't change. Reset the timetable first.");

    const slotsOnDate = await prisma.timeSlot.findMany({
      where: { date: new Date(`${date}T00:00:00Z`), id: { not: id } },
      select: { startTime: true, endTime: true, label: true },
    });
    const newStart = toTime(start).getTime();
    const newEnd = toTime(end).getTime();
    const overlapping = slotsOnDate.find(
      (s) => newStart < new Date(s.endTime).getTime() && newEnd > new Date(s.startTime).getTime()
    );
    if (overlapping) return conflict(`Slot overlaps with existing slot: "${overlapping.label}"`);
  }

  try {
    const updated = await prisma.timeSlot.update({
      where: { id },
      data: {
        date: new Date(`${date}T00:00:00Z`),
        startTime: toTime(start),
        endTime: toTime(end),
        ...(parsed.data.label ? { label: parsed.data.label } : {}),
      },
    });
    return ok(updated, "Time slot updated");
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") return conflict("A slot already exists for this date and start time");
    throw e;
  }
});

export const DELETE = withHandler(async (_req: Request, ctx: RouteContext<"/api/slots/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const existing = await prisma.timeSlot.findUnique({ where: { id } });
  if (!existing) return notFound("Time slot not found");

  const inUse = await prisma.timetableEntry.count({ where: { timeSlotId: id } });
  if (inUse > 0)
    return conflict("Cannot delete — this time slot has timetable entries referencing it. Reset the timetable first.");

  await prisma.timeSlot.delete({ where: { id } });
  return ok(null, "Time slot deleted");
});
