import { prisma } from "@/lib/prisma";
import { requireStudentUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, notFound, forbidden, serverError } from "@/lib/api-response";
import type { RouteContext } from "@/lib/route-types";

export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/enrollments/[courseId]">
) {
  try {
  const auth = await requireStudentUser();
  if (isErrorResponse(auth)) return auth;

  const { courseId } = await ctx.params;
  const session = new URL(request.url).searchParams.get("session");
  if (!session) return badRequest("session query parameter is required");

  const student = await prisma.student.findUnique({ where: { authUserId: auth.id } });
  if (!student) return badRequest("Student profile not found");

  const enrollment = await prisma.studentCourse.findUnique({
    where: { studentId_courseId_session: { studentId: student.id, courseId, session } },
  });
  if (!enrollment) return notFound("Enrollment not found");
  if (enrollment.deletedAt) return badRequest("Already dropped this course");

  // Block drops after timetable is published
  const published = await prisma.timetableEntry.findFirst({
    where: { courseId, session, status: "PUBLISHED" },
  });
  if (published) return forbidden("Timetable has been published — course drops are no longer allowed");

  await prisma.studentCourse.update({
    where: { studentId_courseId_session: { studentId: student.id, courseId, session } },
    data: { deletedAt: new Date() },
  });

  return ok(null, "Course dropped successfully");
  } catch (err) {
    console.error("[route-error]", err);
    return serverError();
  }
}
