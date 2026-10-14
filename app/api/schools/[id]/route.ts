import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, notFound, conflict, zodErrors } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import { z } from "zod";
import type { RouteContext } from "@/lib/route-types";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  code: z.string().trim().min(2).max(50).toUpperCase().optional(),
});

export const GET = withHandler(async (_req: Request, ctx: RouteContext<"/api/schools/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const school = await prisma.school.findUnique({ where: { id } });
  if (!school) return notFound("School not found");
  return ok(school);
});

export const PUT = withHandler(async (request: Request, ctx: RouteContext<"/api/schools/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", zodErrors(parsed.error.issues));

  const existing = await prisma.school.findUnique({ where: { id } });
  if (!existing) return notFound("School not found");

  try {
    const updated = await prisma.school.update({ where: { id }, data: parsed.data });
    return ok(updated, "School updated");
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") return conflict("School code already exists");
    throw e;
  }
});

/**
 * Deleting a school also deletes its departments, programmes, levels and courses
 * (database cascade). Refused while any student belongs to one of its departments.
 */
export const DELETE = withHandler(async (_req: Request, ctx: RouteContext<"/api/schools/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const existing = await prisma.school.findUnique({ where: { id } });
  if (!existing) return notFound("School not found");

  const studentCount = await prisma.student.count({ where: { department: { schoolId: id } } });
  if (studentCount > 0)
    return conflict(`Cannot delete — ${studentCount} student(s) belong to departments in this school.`);

  const published = await prisma.timetableEntry.count({
    where: { status: "PUBLISHED", course: { level: { programme: { department: { schoolId: id } } } } },
  });
  if (published > 0)
    return conflict("Cannot delete — this school's courses are on a published timetable. Reset the timetable first.");

  await prisma.school.delete({ where: { id } });
  return ok(null, "School deleted");
});
