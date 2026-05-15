import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, notFound, conflict } from "@/lib/api-response";
import { z } from "zod";
import type { RouteContext } from "@/lib/route-types";

const updateSchema = z.object({
  code: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  creditUnits: z.number().int().min(1).optional(),
  semester: z.enum(["FIRST", "SECOND"]).optional(),
  levelId: z.string().uuid().optional(),
});

export async function GET(_req: Request, ctx: RouteContext<"/api/courses/[id]">) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const course = await prisma.course.findUnique({
    where: { id },
    include: { level: { include: { programme: true } } },
  });
  if (!course) return notFound("Course not found");
  return ok(course);
}

export async function PUT(request: Request, ctx: RouteContext<"/api/courses/[id]">) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success)
    return badRequest("Validation failed", parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));

  const existing = await prisma.course.findUnique({ where: { id } });
  if (!existing) return notFound("Course not found");

  const updated = await prisma.course.update({ where: { id }, data: parsed.data });
  return ok(updated, "Course updated");
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/courses/[id]">) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const existing = await prisma.course.findUnique({ where: { id } });
  if (!existing) return notFound("Course not found");

  // DH-3: guard against destroying published timetable data and active enrollments
  const publishedEntry = await prisma.timetableEntry.findFirst({
    where: { courseId: id, status: "PUBLISHED" },
    select: { id: true },
  });
  if (publishedEntry)
    return conflict("Cannot delete — this course has published timetable entries. Reset the timetable first.");

  const enrollmentCount = await prisma.studentCourse.count({ where: { courseId: id, deletedAt: null } });
  if (enrollmentCount > 0)
    return conflict(`Cannot delete — ${enrollmentCount} student(s) are enrolled in this course.`);

  try {
    await prisma.course.delete({ where: { id } });
    return ok(null, "Course deleted");
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2003")
      return conflict("Course is still referenced by other records and cannot be deleted.");
    throw e;
  }
}
