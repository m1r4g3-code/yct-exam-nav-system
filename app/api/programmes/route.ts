import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, created, badRequest, serverError } from "@/lib/api-response";
import { z } from "zod";
import type { NextRequest } from "next/server";

const schema = z.object({
  name: z.string().min(2).max(100),
  code: z.string().min(2).max(20).toUpperCase(),
  departmentId: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  const departmentId = request.nextUrl.searchParams.get("department_id") ?? undefined;
  const programmes = await prisma.programme.findMany({
    where: departmentId ? { departmentId } : undefined,
    include: { department: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  return ok(programmes);
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser();
    if (isErrorResponse(auth)) return auth;

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));

    const programme = await prisma.programme.create({ data: parsed.data });
    return created(programme);
  } catch (err) {
    console.error("[route-error]", err);
    return serverError();
  }
}
