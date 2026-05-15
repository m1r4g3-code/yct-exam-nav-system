import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, notFound, conflict } from "@/lib/api-response";
import { z } from "zod";
import type { RouteContext } from "@/lib/route-types";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  year: z.number().int().min(1).optional(),
  programmeId: z.string().uuid().optional(),
});

export async function GET(_req: Request, ctx: RouteContext<"/api/levels/[id]">) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const level = await prisma.level.findUnique({ where: { id }, include: { programme: true } });
  if (!level) return notFound("Level not found");
  return ok(level);
}

export async function PUT(request: Request, ctx: RouteContext<"/api/levels/[id]">) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success)
    return badRequest("Validation failed", parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));

  const existing = await prisma.level.findUnique({ where: { id } });
  if (!existing) return notFound("Level not found");

  const updated = await prisma.level.update({ where: { id }, data: parsed.data });
  return ok(updated, "Level updated");
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/levels/[id]">) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const existing = await prisma.level.findUnique({ where: { id } });
  if (!existing) return notFound("Level not found");

  // DH-3: guard against destroying student records and published timetable data
  const studentCount = await prisma.student.count({ where: { levelId: id } });
  if (studentCount > 0)
    return conflict(`Cannot delete — ${studentCount} student(s) are registered at this level.`);

  const publishedEntry = await prisma.timetableEntry.findFirst({
    where: { course: { levelId: id }, status: "PUBLISHED" },
    select: { id: true },
  });
  if (publishedEntry)
    return conflict("Cannot delete — this level has published timetable entries. Reset the timetable first.");

  try {
    await prisma.level.delete({ where: { id } });
    return ok(null, "Level deleted");
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2003")
      return conflict("Level is still referenced by other records and cannot be deleted.");
    throw e;
  }
}
