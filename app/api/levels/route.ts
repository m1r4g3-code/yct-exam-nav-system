import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, created, badRequest, conflict, zodErrors } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import { z } from "zod";
import type { NextRequest } from "next/server";

const schema = z.object({
  name: z.string().trim().min(2).max(50),
  year: z.number().int().min(1).max(4),
  programmeId: z.string().uuid(),
});

// Public read (the student sign-up form needs it).
export const GET = withHandler(async (request: NextRequest) => {
  const programmeId = request.nextUrl.searchParams.get("programme_id") ?? undefined;
  const departmentId = request.nextUrl.searchParams.get("department_id") ?? undefined;

  const where = departmentId
    ? { programme: { departmentId } }
    : programmeId
    ? { programmeId }
    : undefined;

  const levels = await prisma.level.findMany({
    where,
    include: {
      programme: { select: { name: true, code: true, department: { select: { code: true } } } },
    },
    orderBy: [{ programme: { name: "asc" } }, { year: "asc" }],
  });
  return ok(levels);
});

export const POST = withHandler(async (request: Request) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", zodErrors(parsed.error.issues));

  try {
    const level = await prisma.level.create({ data: parsed.data });
    return created(level, "Level created");
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002")
      return conflict(`This programme already has a level for year ${parsed.data.year}`);
    throw e;
  }
});
