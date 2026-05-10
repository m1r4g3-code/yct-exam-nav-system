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
  if (!parsed.success)
    return badRequest(
      "Validation failed",
      parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
    );

  try {
    // Create department + standard Yabatech programmes (ND & HND) + years in one transaction
    const dept = await prisma.$transaction(async (tx) => {
      const department = await tx.department.create({ data: parsed.data });

      const nd = await tx.programme.create({
        data: { name: "National Diploma (ND)", code: "ND", departmentId: department.id },
      });
      const hnd = await tx.programme.create({
        data: { name: "Higher National Diploma (HND)", code: "HND", departmentId: department.id },
      });

      await tx.level.createMany({
        data: [
          { name: "ND 1", year: 1, programmeId: nd.id },
          { name: "ND 2", year: 2, programmeId: nd.id },
          { name: "HND 1", year: 1, programmeId: hnd.id },
          { name: "HND 2", year: 2, programmeId: hnd.id },
        ],
      });

      return department;
    });

    return created(dept);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "P2002") return badRequest("Department code already exists");
    throw e;
  }
}
