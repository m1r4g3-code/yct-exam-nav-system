import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, created, badRequest, conflict, zodErrors } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import { z } from "zod";
import type { NextRequest } from "next/server";

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().min(2).max(20).toUpperCase(),
  departmentId: z.string().uuid(),
});

// Public read (the student sign-up form needs it).
export const GET = withHandler(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;
  const departmentId = searchParams.get("department_id") ?? undefined;
  const schoolId = searchParams.get("school_id") ?? undefined;

  const programmes = await prisma.programme.findMany({
    where: departmentId ? { departmentId } : schoolId ? { department: { schoolId } } : undefined,
    include: { department: { select: { name: true, code: true } } },
    orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
  });
  return ok(programmes);
});

export const POST = withHandler(async (request: Request) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", zodErrors(parsed.error.issues));

  try {
    const programme = await prisma.programme.create({ data: parsed.data });
    return created(programme, "Programme created");
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002")
      return conflict(`This department already has a programme with code ${parsed.data.code}`);
    throw e;
  }
});
