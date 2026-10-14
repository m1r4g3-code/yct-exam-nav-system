import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, created, badRequest, conflict, zodErrors } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import { createDepartmentWithStructure } from "@/lib/departments";
import { z } from "zod";
import type { NextRequest } from "next/server";

const schema = z.object({
  name: z.string().trim().min(2).max(255),
  code: z.string().trim().min(2).max(50).toUpperCase(),
  schoolId: z.string().uuid(),
});

// Public read (the student sign-up form needs it).
export const GET = withHandler(async (request: NextRequest) => {
  const schoolId = request.nextUrl.searchParams.get("school_id") ?? undefined;
  const depts = await prisma.department.findMany({
    where: schoolId ? { schoolId } : undefined,
    include: { school: { select: { name: true, code: true } } },
    orderBy: { name: "asc" },
  });
  return ok(depts);
});

export const POST = withHandler(async (request: Request) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", zodErrors(parsed.error.issues));

  try {
    // Department + standard Yabatech programmes (ND & HND) + levels in one transaction
    const dept = await prisma.$transaction((tx) => createDepartmentWithStructure(tx, parsed.data));
    return created(dept, "Department created with ND and HND programmes and levels");
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") return conflict("Department code already exists");
    throw e;
  }
});
