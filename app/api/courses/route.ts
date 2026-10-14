import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, created, badRequest, conflict, zodErrors, parsePagination, pageMeta } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import type { Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";
import type { NextRequest } from "next/server";

const schema = z.object({
  code: z.string().trim().min(2).max(20).toUpperCase(),
  title: z.string().trim().min(2).max(255),
  creditUnits: z.number().int().min(1).max(6),
  semester: z.enum(["FIRST", "SECOND"]),
  levelId: z.string().uuid(),
});

/**
 * Public read (students' course pickers need it). Filters: level_id, programme_id,
 * department_id, school_id and search (code or title). Paginated with page/limit
 * (default and maximum 500); totals are returned in `meta`.
 */
export const GET = withHandler(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;
  const levelId = searchParams.get("level_id") || undefined;
  const programmeId = searchParams.get("programme_id") || undefined;
  const departmentId = searchParams.get("department_id") || undefined;
  const schoolId = searchParams.get("school_id") || undefined;
  const search = searchParams.get("search")?.trim() || undefined;
  const { page, limit, skip } = parsePagination(searchParams, { limit: 500, maxLimit: 500 });

  const where: Prisma.CourseWhereInput = {
    ...(levelId
      ? { levelId }
      : programmeId
      ? { level: { programmeId } }
      : departmentId
      ? { level: { programme: { departmentId } } }
      : schoolId
      ? { level: { programme: { department: { schoolId } } } }
      : {}),
    ...(search
      ? {
          OR: [
            { code: { contains: search, mode: "insensitive" } },
            { title: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [courses, total] = await Promise.all([
    prisma.course.findMany({
      where,
      include: {
        level: {
          select: {
            id: true,
            name: true,
            year: true,
            programme: {
              select: {
                id: true,
                name: true,
                code: true,
                department: { select: { id: true, name: true, code: true, schoolId: true } },
              },
            },
          },
        },
      },
      orderBy: { code: "asc" },
      take: limit,
      skip,
    }),
    prisma.course.count({ where }),
  ]);
  return ok(courses, "Success", pageMeta(total, page, limit));
});

export const POST = withHandler(async (request: Request) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", zodErrors(parsed.error.issues));

  try {
    const course = await prisma.course.create({ data: parsed.data });
    return created(course, "Course created");
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") return conflict("Course code already exists");
    throw e;
  }
});
