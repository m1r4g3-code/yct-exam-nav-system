import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, notFound, serverError } from "@/lib/api-response";
import type { RouteContext } from "@/lib/route-types";

// [id] is the session string (URL-encoded)
export async function PUT(
  _request: Request,
  ctx: RouteContext<"/api/timetable/[id]/publish">
) {
  try {
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
      _count: { select: { hallAssignments: true, studentAssignments: true } },
    },
  });

  if (drafts.length === 0) {
    return notFound("No draft timetable entries found for this session");
  }

  // Block if any course has zero hall assignments (hard overflow — not scheduled at all)
  const noHallEntries = drafts.filter((e) => e._count.hallAssignments === 0);
  if (noHallEntries.length > 0) {
    return badRequest(
      `Cannot publish: ${noHallEntries.length} course(s) have no hall assignments. Resolve hall overflow before publishing.`,
      noHallEntries.map((e) => ({ field: "courseId", message: e.courseId }))
    );
  }

  // Block if any course has real enrollments where not every student got a seat
  // (partial overflow: hall capacity < enrollment count).
  const courseIds = drafts.map((e) => e.courseId);
  const enrollmentCounts = await prisma.studentCourse.groupBy({
    by: ["courseId"],
    where: { session, deletedAt: null, courseId: { in: courseIds } },
    _count: { _all: true },
  });
  const enrollmentMap = new Map(enrollmentCounts.map((r) => [r.courseId, r._count._all]));

  const partialOverflow = drafts.filter((e) => {
    const enrolled = enrollmentMap.get(e.courseId) ?? 0;
    return enrolled > 0 && enrolled > e._count.studentAssignments;
  });
  if (partialOverflow.length > 0) {
    const unseated = partialOverflow.reduce((acc, e) => {
      const enrolled = enrollmentMap.get(e.courseId) ?? 0;
      return acc + (enrolled - e._count.studentAssignments);
    }, 0);
    return badRequest(
      `Cannot publish: ${partialOverflow.length} course(s) have ${unseated} enrolled student(s) without seat assignments. ` +
        "Add more exam halls or increase hall capacity, then regenerate.",
      partialOverflow.map((e) => ({ field: "courseId", message: e.courseId }))
    );
  }

  await prisma.timetableEntry.updateMany({
    where: { session, status: "DRAFT" },
    data: { status: "PUBLISHED" },
  });

  return ok({ published: drafts.length }, `Published ${drafts.length} timetable entries`);
  } catch (err) {
    console.error("[route-error]", err);
    return serverError();
  }
}
