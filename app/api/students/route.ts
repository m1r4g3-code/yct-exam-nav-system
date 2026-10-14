import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, parsePagination } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { NextRequest } from "next/server";

export const GET = withHandler(async (request: NextRequest) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const params = request.nextUrl.searchParams;
  const schoolId = params.get("school_id") || undefined;
  const departmentId = params.get("department_id") || undefined;
  const levelId = params.get("level_id") || undefined;
  const search = params.get("search")?.trim() || undefined;
  const { page, limit, skip } = parsePagination(params, { limit: 50, maxLimit: 100 });

  const where: Prisma.StudentWhereInput = {
    ...(search && {
      OR: [
        { fullName: { contains: search, mode: "insensitive" } },
        { matricNumber: { contains: search, mode: "insensitive" } },
      ],
    }),
    ...(schoolId && { department: { schoolId } }),
    ...(departmentId && { departmentId }),
    ...(levelId && { levelId }),
  };

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      include: {
        level: { select: { name: true } },
        department: { select: { name: true, code: true } },
      },
      orderBy: { matricNumber: "asc" },
      skip,
      take: limit,
    }),
    prisma.student.count({ where }),
  ]);

  return ok({ students, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});
