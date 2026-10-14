import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, notFound, conflict, zodErrors } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import { z } from "zod";
import type { RouteContext } from "@/lib/route-types";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(50).optional(),
  year: z.number().int().min(1).max(4).optional(),
  programmeId: z.string().uuid().optional(),
});

export const GET = withHandler(async (_req: Request, ctx: RouteContext<"/api/levels/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const level = await prisma.level.findUnique({ where: { id }, include: { programme: true } });
  if (!level) return notFound("Level not found");
  return ok(level);
});

export const PUT = withHandler(async (request: Request, ctx: RouteContext<"/api/levels/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", zodErrors(parsed.error.issues));

  const existing = await prisma.level.findUnique({ where: { id } });
  if (!existing) return notFound("Level not found");

  // Students store their programme alongside the level, so a level with
  // students can't move to another programme.
  if (parsed.data.programmeId && parsed.data.programmeId !== existing.programmeId) {
    const studentCount = await prisma.student.count({ where: { levelId: id } });
    if (studentCount > 0)
      return conflict(`Cannot move — ${studentCount} student(s) are registered at this level.`);
  }

  try {
    const updated = await prisma.level.update({ where: { id }, data: parsed.data });
    return ok(updated, "Level updated");
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002")
      return conflict(`That programme already has a level for year ${parsed.data.year ?? existing.year}`);
    throw e;
  }
});

export const DELETE = withHandler(async (_req: Request, ctx: RouteContext<"/api/levels/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const existing = await prisma.level.findUnique({ where: { id } });
  if (!existing) return notFound("Level not found");

  // Guard against destroying student records and published timetable data
  const studentCount = await prisma.student.count({ where: { levelId: id } });
  if (studentCount > 0)
    return conflict(`Cannot delete — ${studentCount} student(s) are registered at this level.`);

  const publishedEntry = await prisma.timetableEntry.findFirst({
    where: { course: { levelId: id }, status: "PUBLISHED" },
    select: { id: true },
  });
  if (publishedEntry)
    return conflict("Cannot delete — this level has published timetable entries. Reset the timetable first.");

  await prisma.level.delete({ where: { id } });
  return ok(null, "Level deleted");
});
