import { prisma } from "@/lib/prisma";
import { requireStudentUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, serverError } from "@/lib/api-response";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
  const auth = await requireStudentUser();
  if (isErrorResponse(auth)) return auth;

  const session = request.nextUrl.searchParams.get("session");
  if (!session) return badRequest("session query parameter is required");

  const student = await prisma.student.findUnique({ where: { authUserId: auth.id } });
  if (!student) return badRequest("Student profile not found");

  // Scope timetable to courses the student is actually enrolled in for this
  // session. This keeps the timetable consistent with the Courses tab — a
  // student who registered for 4 out of 6 level courses sees 4 exam entries,
  // not all 6. Falls back to the full level timetable only when the student
  // has no enrollment records (e.g. fresh account before first registration).
  const enrollments = await prisma.studentCourse.findMany({
    where: { studentId: student.id, session, deletedAt: null },
    select: { courseId: true },
  });

  const enrolledCourseIds = enrollments.map((e) => e.courseId);

  // When the student has no course enrollments for this session (e.g. enrolled in
  // a different semester, or fresh account), fall back to all published entries for
  // their level. They will see the exam schedule without individual seat numbers.
  const entryWhere =
    enrolledCourseIds.length > 0
      ? { courseId: { in: enrolledCourseIds }, session, status: "PUBLISHED" as const }
      : { course: { levelId: student.levelId }, session, status: "PUBLISHED" as const };

  const entries = await prisma.timetableEntry.findMany({
    where: entryWhere,
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
        orderBy: { createdAt: "asc" },
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
  } catch (err) {
    console.error("[route-error]", err);
    return serverError();
  }
}
