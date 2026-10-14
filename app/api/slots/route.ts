import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, created, badRequest, conflict, zodErrors } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import { z } from "zod";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const schema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    startTime: z.string().regex(TIME, "Time must be HH:MM"),
    endTime: z.string().regex(TIME, "Time must be HH:MM"),
    label: z.string().trim().min(2).max(100),
  })
  .refine((s) => s.endTime > s.startTime, { message: "End time must be after start time", path: ["endTime"] });

const toTime = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);

export const GET = withHandler(async () => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const slots = await prisma.timeSlot.findMany({ orderBy: [{ date: "asc" }, { startTime: "asc" }] });
  return ok(slots);
});

export const POST = withHandler(async (request: Request) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", zodErrors(parsed.error.issues));

  // Reject slots whose time range overlaps any existing slot on the same date
  const newStart = toTime(parsed.data.startTime).getTime();
  const newEnd = toTime(parsed.data.endTime).getTime();
  const slotsOnDate = await prisma.timeSlot.findMany({
    where: { date: new Date(`${parsed.data.date}T00:00:00Z`) },
    select: { startTime: true, endTime: true, label: true },
  });
  const overlapping = slotsOnDate.find(
    (s) => newStart < new Date(s.endTime).getTime() && newEnd > new Date(s.startTime).getTime()
  );
  if (overlapping) return conflict(`Slot overlaps with existing slot: "${overlapping.label}"`);

  try {
    const slot = await prisma.timeSlot.create({
      data: {
        date: new Date(`${parsed.data.date}T00:00:00Z`),
        startTime: toTime(parsed.data.startTime),
        endTime: toTime(parsed.data.endTime),
        label: parsed.data.label,
      },
    });
    return created(slot, "Time slot created");
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") return conflict("A slot already exists for this date and start time");
    throw e;
  }
});
