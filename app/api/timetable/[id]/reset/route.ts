import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest } from "@/lib/api-response";
import { VALID_SESSIONS } from "@/lib/constants";
import type { RouteContext } from "@/lib/route-types";

// [id] is the session string (URL-encoded)
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/timetable/[id]/reset">
) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id: session } = await ctx.params;

  if (!(VALID_SESSIONS as readonly string[]).includes(session)) {
    return badRequest("Invalid session");
  }

  // Delete all entries (draft and published) so the admin can regenerate from scratch
  const { count } = await prisma.timetableEntry.deleteMany({
    where: { session },
  });

  return ok({ deleted: count }, `Deleted ${count} timetable entries`);
}
