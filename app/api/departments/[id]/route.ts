import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, notFound, conflict, zodErrors } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import { z } from "zod";
import type { RouteContext } from "@/lib/route-types";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  code: z.string().trim().min(2).max(50).toUpperCase().optional(),
  schoolId: z.string().uuid().optional(),
});

export const GET = withHandler(async (_req: Request, ctx: RouteContext<"/api/departments/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const dept = await prisma.department.findUnique({ where: { id }, include: { school: true } });
  if (!dept) return notFound("Department not found");
  return ok(dept);
});

export const PUT = withHandler(async (request: Request, ctx: RouteContext<"/api/departments/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", zodErrors(parsed.error.issues));

  const existing = await prisma.department.findUnique({ where: { id } });
  if (!existing) return notFound("Department not found");

  try {
    const updated = await prisma.department.update({ where: { id }, data: parsed.data });
    return ok(updated, "Department updated");
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") return conflict("Department code already exists");
    throw e;
  }
});

export const DELETE = withHandler(async (_req: Request, ctx: RouteContext<"/api/departments/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const existing = await prisma.department.findUnique({ where: { id } });
  if (!existing) return notFound("Department not found");

  // Prevent deletion when students belong to this department
  const studentCount = await prisma.student.count({ where: { departmentId: id } });
  if (studentCount > 0)
    return conflict(`Cannot delete — ${studentCount} student(s) are in this department.`);

  const published = await prisma.timetableEntry.count({
    where: { status: "PUBLISHED", course: { level: { programme: { departmentId: id } } } },
  });
  if (published > 0)
    return conflict("Cannot delete — this department's courses are on a published timetable. Reset the timetable first.");

  await prisma.department.delete({ where: { id } });
  return ok(null, "Department deleted");
});
