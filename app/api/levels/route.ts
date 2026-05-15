import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, created, badRequest, serverError } from "@/lib/api-response";
import { z } from "zod";
import type { NextRequest } from "next/server";

const schema = z.object({
  name: z.string().min(2).max(50),
  year: z.number().int().min(1).max(2),
  programmeId: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  const programmeId = request.nextUrl.searchParams.get("programme_id") ?? undefined;
  const departmentId = request.nextUrl.searchParams.get("department_id") ?? undefined;

  const where = departmentId
    ? { programme: { departmentId } }
    : programmeId
    ? { programmeId }
    : undefined;

  const levels = await prisma.level.findMany({
    where,
    include: { programme: { select: { name: true, code: true } } },
    orderBy: [{ programme: { name: "asc" } }, { year: "asc" }],
  });
  return ok(levels);
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser();
    if (isErrorResponse(auth)) return auth;

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));

    const level = await prisma.level.create({ data: parsed.data });
    return created(level);
  } catch (err) {
    console.error("[route-error]", err);
    return serverError();
  }
}
