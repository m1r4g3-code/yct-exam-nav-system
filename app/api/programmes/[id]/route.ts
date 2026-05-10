import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, notFound } from "@/lib/api-response";
import { z } from "zod";
import type { RouteContext } from "@/lib/route-types";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  departmentId: z.string().uuid().optional(),
});

export async function GET(_req: Request, ctx: RouteContext<"/api/programmes/[id]">) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const prog = await prisma.programme.findUnique({ where: { id }, include: { department: true } });
  if (!prog) return notFound("Programme not found");
  return ok(prog);
}

export async function PUT(request: Request, ctx: RouteContext<"/api/programmes/[id]">) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success)
    return badRequest("Validation failed", parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));

  const existing = await prisma.programme.findUnique({ where: { id } });
  if (!existing) return notFound("Programme not found");

  const updated = await prisma.programme.update({ where: { id }, data: parsed.data });
  return ok(updated, "Programme updated");
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/programmes/[id]">) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const existing = await prisma.programme.findUnique({ where: { id } });
  if (!existing) return notFound("Programme not found");

  await prisma.programme.delete({ where: { id } });
  return ok(null, "Programme deleted");
}
