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
    select: { id: true },
  });

  if (drafts.length === 0) {
    return notFound("No draft timetable entries found for this session");
  }

  await prisma.timetableEntry.updateMany({
    where: { session, status: "DRAFT" },
    data: { status: "PUBLISHED" },
  });

  return ok({ published: drafts.length }, `Published ${drafts.length} timetable entries`);
}
