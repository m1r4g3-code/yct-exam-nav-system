import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, notFound, conflict, zodErrors } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import { z } from "zod";
import type { RouteContext } from "@/lib/route-types";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  code: z.string().trim().min(2).max(20).toUpperCase().optional(),
  departmentId: z.string().uuid().optional(),
});

export const GET = withHandler(async (_req: Request, ctx: RouteContext<"/api/programmes/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const prog = await prisma.programme.findUnique({ where: { id }, include: { department: true } });
  if (!prog) return notFound("Programme not found");
  return ok(prog);
});

export const PUT = withHandler(async (request: Request, ctx: RouteContext<"/api/programmes/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", zodErrors(parsed.error.issues));

  const existing = await prisma.programme.findUnique({ where: { id } });
  if (!existing) return notFound("Programme not found");

  // Students store their department alongside the programme, so a programme
  // with students can't move to another department.
  if (parsed.data.departmentId && parsed.data.departmentId !== existing.departmentId) {
    const studentCount = await prisma.student.count({ where: { programmeId: id } });
    if (studentCount > 0)
      return conflict(`Cannot move — ${studentCount} student(s) are registered on this programme.`);
  }

  try {
    const updated = await prisma.programme.update({ where: { id }, data: parsed.data });
    return ok(updated, "Programme updated");
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002")
      return conflict(`That department already has a programme with code ${parsed.data.code ?? existing.code}`);
    throw e;
  }
});

export const DELETE = withHandler(async (_req: Request, ctx: RouteContext<"/api/programmes/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const existing = await prisma.programme.findUnique({ where: { id } });
  if (!existing) return notFound("Programme not found");

  // Prevent deletion of programmes with registered students
  const studentCount = await prisma.student.count({ where: { programmeId: id } });
  if (studentCount > 0)
    return conflict(`Cannot delete — ${studentCount} student(s) are registered on this programme.`);

  const published = await prisma.timetableEntry.count({
    where: { status: "PUBLISHED", course: { level: { programmeId: id } } },
  });
  if (published > 0)
    return conflict("Cannot delete — this programme's courses are on a published timetable. Reset the timetable first.");

  await prisma.programme.delete({ where: { id } });
  return ok(null, "Programme deleted");
});
