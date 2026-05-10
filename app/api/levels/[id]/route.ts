import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, notFound } from "@/lib/api-response";
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

  await prisma.level.delete({ where: { id } });
  return ok(null, "Level deleted");
}
