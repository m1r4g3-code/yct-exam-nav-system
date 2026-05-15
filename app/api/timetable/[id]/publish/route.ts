import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, notFound } from "@/lib/api-response";
import { VALID_SESSIONS } from "@/lib/constants";
import type { RouteContext } from "@/lib/route-types";

// [id] is the session string (URL-encoded)
export async function PUT(
  _request: Request,
  ctx: RouteContext<"/api/timetable/[id]/publish">
) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id: session } = await ctx.params;

  if (!(VALID_SESSIONS as readonly string[]).includes(session)) {
    return badRequest("Invalid session");
  }

  const drafts = await prisma.timetableEntry.findMany({
    where: { session, status: "DRAFT" },
    select: {
      id: true,
      courseId: true,
      _count: { select: { hallAssignments: true } },
    },
  });

  if (drafts.length === 0) {
    return notFound("No draft timetable entries found for this session");
  }

  // FP-15: block publish if any course has no hall assignments (overflow not resolved)
  const overflowEntries = drafts.filter((e) => e._count.hallAssignments === 0);
  if (overflowEntries.length > 0) {
    return badRequest(
      `Cannot publish: ${overflowEntries.length} course(s) have no hall assignments. Resolve hall overflow before publishing.`,
      overflowEntries.map((e) => ({ field: "courseId", message: e.courseId }))
    );
  }

  await prisma.timetableEntry.updateMany({
    where: { session, status: "DRAFT" },
    data: { status: "PUBLISHED" },
  });

  return ok({ published: drafts.length }, `Published ${drafts.length} timetable entries`);
}
