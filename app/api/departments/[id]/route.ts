import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, notFound } from "@/lib/api-response";
import { z } from "zod";
import type { RouteContext } from "@/lib/route-types";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  schoolId: z.string().uuid().optional(),
});

export async function GET(_req: Request, ctx: RouteContext<"/api/departments/[id]">) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const dept = await prisma.department.findUnique({ where: { id }, include: { school: true } });
  if (!dept) return notFound("Department not found");
  return ok(dept);
}

export async function PUT(request: Request, ctx: RouteContext<"/api/departments/[id]">) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success)
    return badRequest("Validation failed", parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));

  const existing = await prisma.department.findUnique({ where: { id } });
  if (!existing) return notFound("Department not found");

  const updated = await prisma.department.update({ where: { id }, data: parsed.data });
  return ok(updated, "Department updated");
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/departments/[id]">) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const existing = await prisma.department.findUnique({ where: { id } });
  if (!existing) return notFound("Department not found");

  await prisma.department.delete({ where: { id } });
  return ok(null, "Department deleted");
}
