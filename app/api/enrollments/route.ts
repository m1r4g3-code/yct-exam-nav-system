import { prisma } from "@/lib/prisma";
import { requireStudentUser, isErrorResponse } from "@/lib/auth";
import { ok, created, badRequest, notFound, conflict, zodErrors } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import { sessionSemester } from "@/lib/sessions";
import { z } from "zod";
import type { NextRequest } from "next/server";

export const GET = withHandler(async (request: NextRequest) => {
  const auth = await requireStudentUser();
  if (isErrorResponse(auth)) return auth;

  const session = request.nextUrl.searchParams.get("session") ?? undefined;

  const student = await prisma.student.findUnique({ where: { authUserId: auth.id } });
  if (!student) return notFound("Student profile not found");

  const enrollments = await prisma.studentCourse.findMany({
    where: { studentId: student.id, ...(session && { session }), deletedAt: null },
    include: {
      course: {
        include: { level: { select: { name: true } } },
      },
    },
    orderBy: { course: { code: "asc" } },
  });

  // A course whose timetable is published is locked: it can no longer be dropped.
  const published =
    enrollments.length > 0
      ? await prisma.timetableEntry.findMany({
          where: {
            status: "PUBLISHED",
            courseId: { in: enrollments.map((e) => e.courseId) },
            ...(session && { session }),
          },
          select: { courseId: true, session: true },
        })
      : [];
  const lockedKeys = new Set(published.map((p) => `${p.courseId}|${p.session}`));

  return ok(
    enrollments.map((e) => ({ ...e, locked: lockedKeys.has(`${e.courseId}|${e.session}`) }))
  );
});

const enrollSchema = z.object({
  courseId: z.string().uuid(),
  session: z.string().min(1, "session is required"),
});

/**
 * Gives a late enrolee a seat in one of the course's halls, if the course is
 * already on the timetable and a hall has room: the lowest seat number not in use
 * (so seats freed by drops are reused), in the hall with the most free seats.
 * The exam's row is locked while the seat is chosen, so two simultaneous
 * enrolments never get the same seat.
 */
async function assignLateSeat(studentId: string, courseId: string, session: string) {
  const entry = await prisma.timetableEntry.findUnique({
    where: { courseId_session: { courseId, session } },
    select: { id: true },
  });
  if (!entry) return null;

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM timetable_entries WHERE id = ${entry.id} FOR UPDATE`;

    const existing = await tx.studentHallAssignment.findUnique({
      where: { studentId_timetableEntryId: { studentId, timetableEntryId: entry.id } },
    });
    if (existing) return existing;

    const [halls, seats] = await Promise.all([
      tx.hallAssignment.findMany({
        where: { timetableEntryId: entry.id },
        select: { id: true, seatEnd: true, examHallId: true, examHall: { select: { capacity: true } } },
      }),
      tx.studentHallAssignment.findMany({
        where: { timetableEntryId: entry.id },
        select: { examHallId: true, seatNumber: true },
      }),
    ]);

    const usedByHall = new Map<string, Set<number>>();
    for (const s of seats) {
      const used = usedByHall.get(s.examHallId) ?? new Set<number>();
      used.add(s.seatNumber);
      usedByHall.set(s.examHallId, used);
    }

    const hall = halls
      .map((h) => ({ ...h, used: usedByHall.get(h.examHallId) ?? new Set<number>() }))
      .filter((h) => h.used.size < h.examHall.capacity)
      .sort(
        (a, b) =>
          b.examHall.capacity - b.used.size - (a.examHall.capacity - a.used.size) ||
          (a.examHallId < b.examHallId ? -1 : 1)
      )[0];
    if (!hall) return null;

    let seatNumber = 1;
    while (hall.used.has(seatNumber)) seatNumber++;

    const seat = await tx.studentHallAssignment.create({
      data: { studentId, timetableEntryId: entry.id, examHallId: hall.examHallId, seatNumber },
    });
    if (seatNumber > hall.seatEnd) {
      await tx.hallAssignment.update({ where: { id: hall.id }, data: { seatEnd: seatNumber } });
    }
    return seat;
  });
}

export const POST = withHandler(async (request: Request) => {
  const auth = await requireStudentUser();
  if (isErrorResponse(auth)) return auth;

  const body = await request.json().catch(() => null);
  const parsed = enrollSchema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", zodErrors(parsed.error.issues));

  const { courseId, session } = parsed.data;

  const sessionRecord = await prisma.session.findUnique({ where: { name: session } });
  if (!sessionRecord) return badRequest(`Unknown session: "${session}"`);
  if (!sessionRecord.isActive) return badRequest("Course registration for this session is closed.");

  const student = await prisma.student.findUnique({ where: { authUserId: auth.id } });
  if (!student) return notFound("Student profile not found");

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { level: true },
  });
  if (!course) return badRequest("Course not found");

  if (course.levelId !== student.levelId) {
    return badRequest("Course does not belong to your level");
  }
  if (course.level.programmeId !== student.programmeId) {
    return badRequest("Course does not belong to your programme");
  }
  const semester = sessionSemester(session);
  if (semester && course.semester !== semester) {
    return badRequest(
      `${course.code} is a ${course.semester === "FIRST" ? "First" : "Second"} Semester course — choose a ${
        course.semester === "FIRST" ? "First" : "Second"
      } Semester session.`
    );
  }

  const key = { studentId_courseId_session: { studentId: student.id, courseId, session } };
  const existing = await prisma.studentCourse.findUnique({ where: key });
  if (existing && !existing.deletedAt) return conflict("Already enrolled in this course for this session");

  // A dropped course can be added again: restore the original enrolment.
  const enrollment = existing
    ? await prisma.studentCourse.update({ where: key, data: { deletedAt: null } })
    : await prisma.studentCourse.create({ data: { studentId: student.id, courseId, session } });

  const seat = await assignLateSeat(student.id, courseId, session);

  return created({ ...enrollment, seatNumber: seat?.seatNumber ?? null }, "Enrolled successfully");
});
