import { prisma } from "@/lib/prisma";
import { requireStudentUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest } from "@/lib/api-response";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireStudentUser();
  if (isErrorResponse(auth)) return auth;

  const session = request.nextUrl.searchParams.get("session");
  if (!session) return badRequest("session query parameter is required");

  const student = await prisma.student.findUnique({ where: { authUserId: auth.id } });
  if (!student) return badRequest("Student profile not found");

  // Get courses the student is enrolled in (active, this session)
  const enrollments = await prisma.studentCourse.findMany({
    where: { studentId: student.id, session, deletedAt: null },
    select: { courseId: true },
  });
  const courseIds = enrollments.map((e) => e.courseId);

  if (courseIds.length === 0) return ok([]);

  // Return published entries for those courses
  const entries = await prisma.timetableEntry.findMany({
    where: { courseId: { in: courseIds }, session, status: "PUBLISHED" },
    include: {
      course: { select: { id: true, code: true, title: true, creditUnits: true } },
      timeSlot: true,
      studentAssignments: {
        where: { studentId: student.id },
        include: {
          examHall: { select: { id: true, name: true, code: true, latitude: true, longitude: true } },
        },
      },
    },
    orderBy: [{ timeSlot: { date: "asc" } }, { timeSlot: { startTime: "asc" } }],
  });

  // Decimal lat/lng → number so Leaflet coordinates work on client
  const mapped = entries.map((e) => ({
    ...e,
    studentAssignments: e.studentAssignments.map((a) => ({
      ...a,
      examHall: a.examHall
        ? { ...a.examHall, latitude: Number(a.examHall.latitude), longitude: Number(a.examHall.longitude) }
        : a.examHall,
    })),
  }));

  return ok(mapped);
}
