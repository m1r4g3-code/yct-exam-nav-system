import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, notFound, conflict, serverError } from "@/lib/api-response";
import { z } from "zod";
import type { RouteContext } from "@/lib/route-types";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  capacity: z.number().int().min(1).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(_req: Request, ctx: RouteContext<"/api/halls/[id]">) {
  try {
    const auth = await requireAdminUser();
    if (isErrorResponse(auth)) return auth;

    const { id } = await ctx.params;
    const hall = await prisma.examHall.findUnique({ where: { id } });
    if (!hall) return notFound("Hall not found");
    return ok(hall);
  } catch (err) {
    console.error("[route-error]", err);
    return serverError();
  }
}

export async function PUT(request: Request, ctx: RouteContext<"/api/halls/[id]">) {
  try {
    const auth = await requireAdminUser();
    if (isErrorResponse(auth)) return auth;

    const { id } = await ctx.params;
    const body = await request.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success)
      return badRequest("Validation failed", parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));

    const existing = await prisma.examHall.findUnique({ where: { id } });
    if (!existing) return notFound("Hall not found");

    const updated = await prisma.examHall.update({ where: { id }, data: parsed.data });
    return ok(updated, "Hall updated");
  } catch (err) {
    console.error("[route-error]", err);
    return serverError();
  }
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/halls/[id]">) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;

  // RED-2: Guard against FK violations. HallAssignment, StudentHallAssignment, and
  // NavigationNode all reference ExamHall with no CASCADE — an unguarded delete throws
  // an unhandled P2003 and returns a raw 500.
  const activeAssignment = await prisma.hallAssignment.findFirst({
    where: { examHallId: id },
    select: { id: true },
  });
  if (activeAssignment)
    return conflict("Hall has active exam assignments. Deactivate it (isActive: false) instead of deleting, or reset the timetable first.");

  try {
    await prisma.examHall.delete({ where: { id } });
    return ok(null, "Hall deleted");
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "P2025") return notFound("Hall not found");
    if (err.code === "P2003")
      return conflict("Hall is still referenced by navigation or student assignment records and cannot be deleted.");
    throw e;
  }
}
