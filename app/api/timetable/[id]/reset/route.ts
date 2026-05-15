import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest } from "@/lib/api-response";
import { VALID_SESSIONS } from "@/lib/constants";
import type { RouteContext } from "@/lib/route-types";
import type { NextRequest } from "next/server";

// [id] is the session string (URL-encoded)
// Add ?confirm=published to bypass the published-entries guard (explicit irreversible action).
export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<"/api/timetable/[id]/reset">
) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id: session } = await ctx.params;

  if (!(VALID_SESSIONS as readonly string[]).includes(session)) {
    return badRequest("Invalid session");
  }

  // SF-2: hard-stop on published sessions unless the caller explicitly confirms.
  // Without this, a mis-click wipes student seat assignments identical to BUG-1.
  const publishedCount = await prisma.timetableEntry.count({
    where: { session, status: "PUBLISHED" },
  });
  if (publishedCount > 0 && request.nextUrl.searchParams.get("confirm") !== "published") {
    return badRequest(
      `This session has ${publishedCount} published entries. Reset is irreversible — add ?confirm=published to the request URL to proceed.`
    );
  }

  const { count } = await prisma.timetableEntry.deleteMany({ where: { session } });
  return ok({ deleted: count }, `Deleted ${count} timetable entries`);
}
