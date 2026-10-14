import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, notFound, conflict, zodErrors } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import { z } from "zod";
import type { RouteContext } from "@/lib/route-types";

const updateSchema = z.object({
  code: z.string().trim().min(2).max(20).toUpperCase().optional(),
  title: z.string().trim().min(2).max(255).optional(),
  creditUnits: z.number().int().min(1).max(6).optional(),
  semester: z.enum(["FIRST", "SECOND"]).optional(),
  levelId: z.string().uuid().optional(),
});

export const GET = withHandler(async (_req: Request, ctx: RouteContext<"/api/courses/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const course = await prisma.course.findUnique({
    where: { id },
    include: { level: { include: { programme: true } } },
  });
  if (!course) return notFound("Course not found");
  return ok(course);
});

export const PUT = withHandler(async (request: Request, ctx: RouteContext<"/api/courses/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", zodErrors(parsed.error.issues));

  const existing = await prisma.course.findUnique({ where: { id } });
  if (!existing) return notFound("Course not found");

  // A published timetable is built from the course's semester and level — keep them fixed.
  const changesSchedule =
    (parsed.data.semester !== undefined && parsed.data.semester !== existing.semester) ||
    (parsed.data.levelId !== undefined && parsed.data.levelId !== existing.levelId);
  if (changesSchedule) {
    const published = await prisma.timetableEntry.findFirst({
      where: { courseId: id, status: "PUBLISHED" },
      select: { id: true },
    });
    if (published)
      return conflict(
        "This course is on a published timetable. Reset the timetable before changing its semester or level."
      );
  }

  try {
    const updated = await prisma.course.update({ where: { id }, data: parsed.data });
    return ok(updated, "Course updated");
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") return conflict("Course code already exists");
    throw e;
  }
});

export const DELETE = withHandler(async (_req: Request, ctx: RouteContext<"/api/courses/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const existing = await prisma.course.findUnique({ where: { id } });
  if (!existing) return notFound("Course not found");

  // Guard against destroying published timetable data and active enrolments
  const publishedEntry = await prisma.timetableEntry.findFirst({
    where: { courseId: id, status: "PUBLISHED" },
    select: { id: true },
  });
  if (publishedEntry)
    return conflict("Cannot delete — this course has published timetable entries. Reset the timetable first.");

  const enrollmentCount = await prisma.studentCourse.count({ where: { courseId: id, deletedAt: null } });
  if (enrollmentCount > 0)
    return conflict(`Cannot delete — ${enrollmentCount} student(s) are enrolled in this course.`);

  await prisma.course.delete({ where: { id } });
  return ok(null, "Course deleted");
});
