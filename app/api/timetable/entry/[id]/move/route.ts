import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, notFound, conflict as conflictRes, forbidden } from "@/lib/api-response";
import { z } from "zod";
import type { RouteContext } from "@/lib/route-types";

const bodySchema = z.object({
  newTimeSlotId: z.string().uuid(),
});

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/timetable/entry/[id]/move">
) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;

  const entry = await prisma.timetableEntry.findUnique({
    where: { id },
    include: { course: { select: { id: true, code: true } } },
  });
  if (!entry) return notFound("Timetable entry not found");
  if (entry.status === "PUBLISHED") return forbidden("Cannot move a published timetable entry");

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success)
    return badRequest("Validation failed", parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));

  const { newTimeSlotId } = parsed.data;

  const slot = await prisma.timeSlot.findUnique({ where: { id: newTimeSlotId } });
  if (!slot) return notFound("Time slot not found");

  // Conflict check: find all neighbors of this course in the conflict graph
  // A conflict exists if any course sharing a student is already in newTimeSlotId for this session
  const enrolledStudentIds = await prisma.studentCourse.findMany({
    where: { courseId: entry.courseId, session: entry.session, deletedAt: null },
    select: { studentId: true },
  });
  const studentIds = enrolledStudentIds.map((e) => e.studentId);

  const conflictingEnrollments = await prisma.studentCourse.findMany({
    where: {
      studentId: { in: studentIds },
      session: entry.session,
      deletedAt: null,
      courseId: { not: entry.courseId },
    },
    select: { courseId: true },
    distinct: ["courseId"],
  });
  const neighborCourseIds = conflictingEnrollments.map((e) => e.courseId);

  // LOOP-2: the generator uses level-based conflict detection, but this endpoint uses
  // enrollment-based. When no enrolled students exist (only level-aggregate headcounts),
  // enrollment-based detection finds no conflicts and the move would incorrectly succeed.
  // Fall back to level-based: all courses in the same level conflict with each other.
  if (neighborCourseIds.length === 0) {
    const courseWithLevel = await prisma.course.findUnique({
      where: { id: entry.courseId },
      select: { levelId: true },
    });
    if (courseWithLevel?.levelId) {
      const sameLevelCourses = await prisma.course.findMany({
        where: { levelId: courseWithLevel.levelId, id: { not: entry.courseId } },
        select: { id: true },
      });
      neighborCourseIds.push(...sameLevelCourses.map((c) => c.id));
    }
  }

  const conflict = await prisma.timetableEntry.findFirst({
    where: {
      courseId: { in: neighborCourseIds },
      session: entry.session,
      timeSlotId: newTimeSlotId,
    },
    include: { course: { select: { code: true } } },
  });

  if (conflict) {
    return conflictRes(
      `Moving to this slot conflicts with ${conflict.course.code} — shared students would have two exams at the same time`
    );
  }

  const updated = await prisma.timetableEntry.update({
    where: { id },
    data: { timeSlotId: newTimeSlotId },
    include: { course: { select: { id: true, code: true } }, timeSlot: true },
  });

  return ok(updated, "Timetable entry moved successfully");
}
