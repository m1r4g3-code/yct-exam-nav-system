import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, created, badRequest } from "@/lib/api-response";
import { z } from "zod";
import type { NextRequest } from "next/server";

const schema = z.object({
  code: z.string().min(2).max(20).toUpperCase(),
  title: z.string().min(2).max(255),
  creditUnits: z.number().int().min(1).max(6),
  semester: z.enum(["FIRST", "SECOND"]),
  levelId: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  const levelId = request.nextUrl.searchParams.get("level_id") ?? undefined;
  const departmentId = request.nextUrl.searchParams.get("department_id") ?? undefined;

  const where = levelId
    ? { levelId }
    : departmentId
    ? { level: { programme: { departmentId } } }
    : undefined;

  const courses = await prisma.course.findMany({
    where,
    include: { level: { select: { name: true } } },
    orderBy: { code: "asc" },
  });
  return ok(courses);
}

export async function POST(request: Request) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));

  try {
    const course = await prisma.course.create({ data: parsed.data });
    return created(course);
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") return badRequest("Course code already exists");
    throw e;
  }
}
