import { prisma } from "@/lib/prisma";
import { requireStudentUser, isErrorResponse } from "@/lib/auth";
import { ok, notFound, badRequest, forbidden } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import type { RouteContext } from "@/lib/route-types";

export const DELETE = withHandler(async (
  request: Request,
  ctx: RouteContext<"/api/enrollments/[courseId]">
) => {
  const auth = await requireStudentUser();
  if (isErrorResponse(auth)) return auth;

  const { courseId } = await ctx.params;
  const session = new URL(request.url).searchParams.get("session");
  if (!session) return badRequest("session query parameter is required");

  const student = await prisma.student.findUnique({ where: { authUserId: auth.id } });
  if (!student) return notFound("Student profile not found");

  const key = { studentId_courseId_session: { studentId: student.id, courseId, session } };
  const enrollment = await prisma.studentCourse.findUnique({ where: key });
  if (!enrollment) return notFound("Enrollment not found");
  if (enrollment.deletedAt) return badRequest("Already dropped this course");

  // Block drops after timetable is published
  const entry = await prisma.timetableEntry.findUnique({
    where: { courseId_session: { courseId, session } },
    select: { id: true, status: true },
  });
  if (entry?.status === "PUBLISHED")
    return forbidden("Timetable has been published — course drops are no longer allowed");

  // Soft-drop the enrolment and free the student's seat in the draft timetable.
  await prisma.$transaction([
    prisma.studentCourse.update({ where: key, data: { deletedAt: new Date() } }),
    ...(entry
      ? [prisma.studentHallAssignment.deleteMany({ where: { studentId: student.id, timetableEntryId: entry.id } })]
      : []),
  ]);

  return ok(null, "Course dropped successfully");
});
