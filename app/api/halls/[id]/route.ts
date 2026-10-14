import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, notFound, conflict, zodErrors } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import { z } from "zod";
import type { RouteContext } from "@/lib/route-types";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  code: z.string().trim().min(2).max(50).toUpperCase().optional(),
  capacity: z.number().int().min(1).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  description: z.string().trim().max(1000).optional(),
  isActive: z.boolean().optional(),
});

const withNumbers = <T extends { latitude: unknown; longitude: unknown }>(h: T) => ({
  ...h,
  latitude: Number(h.latitude),
  longitude: Number(h.longitude),
});

export const GET = withHandler(async (_req: Request, ctx: RouteContext<"/api/halls/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const hall = await prisma.examHall.findUnique({ where: { id } });
  if (!hall) return notFound("Hall not found");
  return ok(withNumbers(hall));
});

export const PUT = withHandler(async (request: Request, ctx: RouteContext<"/api/halls/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", zodErrors(parsed.error.issues));

  const existing = await prisma.examHall.findUnique({ where: { id } });
  if (!existing) return notFound("Hall not found");

  try {
    const updated = await prisma.examHall.update({ where: { id }, data: parsed.data });
    return ok(withNumbers(updated), "Hall updated");
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") return conflict("Hall code already exists");
    throw e;
  }
});

export const DELETE = withHandler(async (_req: Request, ctx: RouteContext<"/api/halls/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const existing = await prisma.examHall.findUnique({ where: { id } });
  if (!existing) return notFound("Hall not found");

  // A hall used by any timetable keeps its bookings — deactivate it instead.
  // (A linked campus-map node is simply unlinked when the hall is deleted.)
  const activeAssignment = await prisma.hallAssignment.findFirst({
    where: { examHallId: id },
    select: { id: true },
  });
  if (activeAssignment)
    return conflict(
      "This hall is used by a timetable. Deactivate it instead of deleting, or reset the timetable first."
    );

  await prisma.examHall.delete({ where: { id } });
  return ok(null, "Hall deleted");
});
