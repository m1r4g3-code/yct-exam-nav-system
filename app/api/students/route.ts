import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest } from "@/lib/api-response";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const departmentId = request.nextUrl.searchParams.get("department_id") ?? undefined;
  const levelId = request.nextUrl.searchParams.get("level_id") ?? undefined;
  const page = parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10);
  const limit = 50;

  const where = {
    ...(departmentId && { departmentId }),
    ...(levelId && { levelId }),
  };

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      include: {
        level: { select: { name: true } },
        department: { select: { name: true } },
      },
      orderBy: { matricNumber: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.student.count({ where }),
  ]);

  return ok({ students, total, page, pages: Math.ceil(total / limit) });
}
