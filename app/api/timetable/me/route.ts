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

  // Try enrollment-based first; fall back to all published entries for the student's level.
  // This makes the timetable visible even before individual course enrollment.
  const enrollments = await prisma.studentCourse.findMany({
    where: { studentId: student.id, session, deletedAt: null },
    select: { courseId: true },
  });

  const where =
    enrollments.length > 0
      ? { courseId: { in: enrollments.map((e) => e.courseId) }, session, status: "PUBLISHED" as const }
      : { course: { levelId: student.levelId }, session, status: "PUBLISHED" as const };

  const entries = await prisma.timetableEntry.findMany({
    where,
    include: {
      course: { select: { id: true, code: true, title: true, creditUnits: true } },
      timeSlot: true,
      // Individual seat assignments (exist when students are enrolled)
      studentAssignments: {
        where: { studentId: student.id },
        include: {
          examHall: {
            select: { id: true, name: true, code: true, latitude: true, longitude: true },
          },
        },
      },
      // Hall-level assignments (always exist after generation)
      hallAssignments: {
        include: {
          examHall: {
            select: { id: true, name: true, code: true, latitude: true, longitude: true },
          },
        },
        orderBy: { seatStart: "asc" },
        take: 1,
      },
    },
    orderBy: [{ timeSlot: { date: "asc" } }, { timeSlot: { startTime: "asc" } }],
  });

  const mapped = entries.map((e) => {
    const toNumber = (h: { id: string; name: string; code: string; latitude: unknown; longitude: unknown } | null) =>
      h ? { ...h, latitude: Number(h.latitude), longitude: Number(h.longitude) } : null;

    // Prefer individual seat assignment; fall back to hall-level assignment (null seat)
    const studentAssignments =
      e.studentAssignments.length > 0
        ? e.studentAssignments.map((a) => ({
            seatNumber: a.seatNumber as number | null,
            examHall: toNumber(a.examHall),
          }))
        : e.hallAssignments.slice(0, 1).map((ha) => ({
            seatNumber: null as number | null,
            examHall: toNumber(ha.examHall),
          }));

    return {
      id: e.id,
      course: e.course,
      timeSlot: e.timeSlot,
      studentAssignments,
    };
  });

  return ok(mapped);
}
