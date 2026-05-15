import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, notFound, serverError } from "@/lib/api-response";
import type { RouteContext } from "@/lib/route-types";

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/sessions/[id]">
) {
  try {
    const auth = await requireAdminUser();
    if (isErrorResponse(auth)) return auth;

    const { id } = await ctx.params;
    const sessionRecord = await prisma.session.findUnique({ where: { id } });
    if (!sessionRecord) return notFound("Session not found");

    // Delete timetable data in dependency order.
    // DB-level cascades handle HallAssignment and StudentHallAssignment (children of TimetableEntry)
    // and GenerationLock (child of Session via onDelete: Cascade).
    await prisma.$transaction([
      prisma.timetableEntry.deleteMany({ where: { session: sessionRecord.name } }),
      prisma.session.delete({ where: { id } }),
    ]);

    return ok(null, `Session "${sessionRecord.name}" deleted`);
  } catch (err) {
    console.error("[route-error]", err);
    return serverError();
  }
}
