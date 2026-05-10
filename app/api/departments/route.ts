import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, created, badRequest } from "@/lib/api-response";
import { z } from "zod";
import type { NextRequest } from "next/server";

const schema = z.object({
  name: z.string().min(2).max(255),
  code: z.string().min(2).max(50).toUpperCase(),
  schoolId: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  const schoolId = request.nextUrl.searchParams.get("school_id") ?? undefined;
  const depts = await prisma.department.findMany({
    where: schoolId ? { schoolId } : undefined,
    include: { school: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  return ok(depts);
}

export async function POST(request: Request) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));

  try {
    const dept = await prisma.department.create({ data: parsed.data });
    return created(dept);
  } catch (e: any) {
    if (e.code === "P2002") return badRequest("Department code already exists");
    throw e;
  }
}
