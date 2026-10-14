import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, notFound, badRequest, zodErrors } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import { z } from "zod";
import type { RouteContext } from "@/lib/route-types";

const updateSchema = z.object({
  isActive: z.boolean(),
});

/**
 * Activates or deactivates a session. Active sessions are offered to students
 * (the newest active one is their default); inactive ones are hidden from them.
 */
export const PATCH = withHandler(async (request: Request, ctx: RouteContext<"/api/sessions/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", zodErrors(parsed.error.issues));

  const existing = await prisma.session.findUnique({ where: { id } });
  if (!existing) return notFound("Session not found");

  const session = await prisma.session.update({
    where: { id },
    data: { isActive: parsed.data.isActive },
  });
  return ok(
    session,
    session.isActive
      ? `"${session.name}" is now visible to students`
      : `"${session.name}" is now hidden from students`
  );
});

/**
 * Deletes a session together with its timetable (enrolment records are kept).
 * When the timetable is published, `?confirm=published` is required.
 */
export const DELETE = withHandler(async (request: Request, ctx: RouteContext<"/api/sessions/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const sessionRecord = await prisma.session.findUnique({ where: { id } });
  if (!sessionRecord) return notFound("Session not found");

  const confirm = new URL(request.url).searchParams.get("confirm");
  const published = await prisma.timetableEntry.count({
    where: { session: sessionRecord.name, status: "PUBLISHED" },
  });
  if (published > 0 && confirm !== "published") {
    return badRequest(
      `"${sessionRecord.name}" has a published timetable (${published} exams). ` +
        "Confirm that you want to delete it for all students."
    );
  }

  // DB-level cascades remove HallAssignment and StudentHallAssignment (children of
  // TimetableEntry) and GenerationLock (child of Session).
  await prisma.$transaction([
    prisma.timetableEntry.deleteMany({ where: { session: sessionRecord.name } }),
    prisma.session.delete({ where: { id } }),
  ]);

  return ok(null, `Session "${sessionRecord.name}" deleted`);
});
