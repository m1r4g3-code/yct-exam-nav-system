import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, notFound } from "@/lib/api-response";
import { z } from "zod";
import type { RouteContext } from "@/lib/route-types";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  capacity: z.number().int().min(1).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(_req: Request, ctx: RouteContext<"/api/halls/[id]">) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const hall = await prisma.examHall.findUnique({ where: { id } });
  if (!hall) return notFound("Hall not found");
  return ok(hall);
}

export async function PUT(request: Request, ctx: RouteContext<"/api/halls/[id]">) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success)
    return badRequest("Validation failed", parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));

  const existing = await prisma.examHall.findUnique({ where: { id } });
  if (!existing) return notFound("Hall not found");

  const updated = await prisma.examHall.update({ where: { id }, data: parsed.data });
  return ok(updated, "Hall updated");
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/halls/[id]">) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const existing = await prisma.examHall.findUnique({ where: { id } });
  if (!existing) return notFound("Hall not found");

  await prisma.examHall.delete({ where: { id } });
  return ok(null, "Hall deleted");
}
