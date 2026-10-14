import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, notFound } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import { sessionSemester } from "@/lib/sessions";
import type { RouteContext } from "@/lib/route-types";

function listCodes(codes: string[]): string {
  const shown = codes.slice(0, 5).join(", ");
  return codes.length > 5 ? `${shown} and ${codes.length - 5} more` : shown;
}

/**
 * Publishes a session's draft timetable. [id] is the URL-encoded session name.
 * Refused until it is complete: every scheduled course has a hall, every
 * enrolled student has a seat, and every course with enrolled students is on
 * the timetable.
 */
export const PUT = withHandler(async (
  _request: Request,
  ctx: RouteContext<"/api/timetable/[id]/publish">
) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id: session } = await ctx.params;

  const sessionRecord = await prisma.session.findUnique({ where: { name: session } });
  if (!sessionRecord) return badRequest(`Unknown session: "${session}"`);

  const drafts = await prisma.timetableEntry.findMany({
    where: { session, status: "DRAFT" },
    select: {
      id: true,
      courseId: true,
      course: { select: { code: true } },
      _count: { select: { hallAssignments: true, studentAssignments: true } },
    },
  });

  if (drafts.length === 0) {
    return notFound("No draft timetable entries found for this session");
  }

  // Every scheduled course needs at least one hall
  const noHallEntries = drafts.filter((e) => e._count.hallAssignments === 0);
  if (noHallEntries.length > 0) {
    return badRequest(
      `Cannot publish: ${noHallEntries.length} course(s) have no hall (${listCodes(noHallEntries.map((e) => e.course.code))}). ` +
        "Add halls or capacity, then generate again.",
      noHallEntries.map((e) => ({ field: "courseId", message: e.courseId }))
    );
  }

  // Every enrolled student needs a seat
  const enrollmentCounts = await prisma.studentCourse.groupBy({
    by: ["courseId"],
    where: { session, deletedAt: null },
    _count: { _all: true },
  });
  const enrollmentMap = new Map(enrollmentCounts.map((r) => [r.courseId, r._count._all]));

  const partialOverflow = drafts.filter((e) => {
    const enrolled = enrollmentMap.get(e.courseId) ?? 0;
    return enrolled > e._count.studentAssignments;
  });
  if (partialOverflow.length > 0) {
    const unseated = partialOverflow.reduce((acc, e) => {
      const enrolled = enrollmentMap.get(e.courseId) ?? 0;
      return acc + (enrolled - e._count.studentAssignments);
    }, 0);
    return badRequest(
      `Cannot publish: ${unseated} enrolled student(s) in ${partialOverflow.length} course(s) have no seat ` +
        `(${listCodes(partialOverflow.map((e) => e.course.code))}). Add halls or capacity, then generate again.`,
      partialOverflow.map((e) => ({ field: "courseId", message: e.courseId }))
    );
  }

  // Every course with enrolled students (for this semester) must be on the timetable
  const semester = sessionSemester(session);
  const scheduled = await prisma.timetableEntry.findMany({ where: { session }, select: { courseId: true } });
  const scheduledIds = new Set(scheduled.map((e) => e.courseId));
  const enrolledCourseIds = [...enrollmentMap.keys()].filter((id) => !scheduledIds.has(id));
  const unscheduled =
    enrolledCourseIds.length > 0
      ? await prisma.course.findMany({
          where: { id: { in: enrolledCourseIds }, ...(semester ? { semester } : {}) },
          select: { id: true, code: true },
          orderBy: { code: "asc" },
        })
      : [];
  if (unscheduled.length > 0) {
    return badRequest(
      `Cannot publish: ${unscheduled.length} course(s) with enrolled students are not on the timetable ` +
        `(${listCodes(unscheduled.map((c) => c.code))}). Generate again — choose a longer exam period if needed.`,
      unscheduled.map((c) => ({ field: "courseId", message: c.id }))
    );
  }

  await prisma.timetableEntry.updateMany({
    where: { session, status: "DRAFT" },
    data: { status: "PUBLISHED" },
  });

  return ok({ published: drafts.length }, `Published ${drafts.length} timetable entries`);
});
