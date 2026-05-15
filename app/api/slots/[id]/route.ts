import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, notFound, conflict } from "@/lib/api-response";
import { z } from "zod";
import type { RouteContext } from "@/lib/route-types";

const updateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  label: z.string().min(1).optional(),
});

export async function GET(_req: Request, ctx: RouteContext<"/api/slots/[id]">) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const slot = await prisma.timeSlot.findUnique({ where: { id } });
  if (!slot) return notFound("Time slot not found");
  return ok(slot);
}

export async function PUT(request: Request, ctx: RouteContext<"/api/slots/[id]">) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (body === null) return badRequest("Invalid or missing JSON body");
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success)
    return badRequest(
      "Validation failed",
      parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
    );

  const existing = await prisma.timeSlot.findUnique({ where: { id } });
  if (!existing) return notFound("Time slot not found");

  const data: Record<string, unknown> = {};
  if (parsed.data.date) data.date = new Date(parsed.data.date);
  if (parsed.data.startTime) data.startTime = new Date(`1970-01-01T${parsed.data.startTime}:00Z`);
  if (parsed.data.endTime) data.endTime = new Date(`1970-01-01T${parsed.data.endTime}:00Z`);
  if (parsed.data.label) data.label = parsed.data.label;

  const updated = await prisma.timeSlot.update({ where: { id }, data });
  return ok(updated, "Time slot updated");
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/slots/[id]">) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const existing = await prisma.timeSlot.findUnique({ where: { id } });
  if (!existing) return notFound("Time slot not found");

  try {
    await prisma.timeSlot.delete({ where: { id } });
    return ok(null, "Time slot deleted");
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2003")
      return conflict(
        "Cannot delete — this time slot has timetable entries referencing it. Reset the timetable first."
      );
    throw e;
  }
}
