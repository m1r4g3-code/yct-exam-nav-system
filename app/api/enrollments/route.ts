import { prisma } from "@/lib/prisma";
import { requireStudentUser, isErrorResponse } from "@/lib/auth";
import { ok, created, badRequest, conflict } from "@/lib/api-response";
import { z } from "zod";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireStudentUser();
  if (isErrorResponse(auth)) return auth;

  const session = request.nextUrl.searchParams.get("session") ?? undefined;

  const student = await prisma.student.findUnique({ where: { authUserId: auth.id } });
  if (!student) return badRequest("Student profile not found");

  const enrollments = await prisma.studentCourse.findMany({
    where: { studentId: student.id, ...(session && { session }), deletedAt: null },
    include: {
      course: {
        include: { level: { select: { name: true } } },
      },
    },
    orderBy: { course: { code: "asc" } },
  });

  return ok(enrollments);
}

const enrollSchema = z.object({
  courseId: z.string().uuid(),
  session: z.string().min(1, "session is required"),
});

export async function POST(request: Request) {
  const auth = await requireStudentUser();
  if (isErrorResponse(auth)) return auth;

  const body = await request.json().catch(() => null);
  const parsed = enrollSchema.safeParse(body);
  if (!parsed.success)
    return badRequest(
      "Validation failed",
      parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
    );

  // Validate session exists in the DB
  const sessionRecord = await prisma.session.findUnique({
    where: { name: parsed.data.session },
  });
  if (!sessionRecord) return badRequest(`Unknown session: "${parsed.data.session}"`);

  const student = await prisma.student.findUnique({ where: { authUserId: auth.id } });
  if (!student) return badRequest("Student profile not found");

  const course = await prisma.course.findUnique({
    where: { id: parsed.data.courseId },
    include: { level: true },
  });
  if (!course) return badRequest("Course not found");

  if (course.levelId !== student.levelId) {
    return badRequest("Course does not belong to your level");
  }

  const publishedEntry = await prisma.timetableEntry.findFirst({
    where: { courseId: parsed.data.courseId, session: parsed.data.session, status: "PUBLISHED" },
    select: { id: true },
  });
  if (publishedEntry)
    return conflict(
      "Enrollment is closed — the timetable for this session has been published. Contact the exam office."
    );

  try {
    const enrollment = await prisma.studentCourse.create({
      data: {
        studentId: student.id,
        courseId: parsed.data.courseId,
        session: parsed.data.session,
      },
    });
    return created(enrollment, "Enrolled successfully");
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "P2002") return conflict("Already enrolled in this course for this session");
    if (err.code === "P2003") return badRequest("Course or student record not found");
    throw e;
  }
}
