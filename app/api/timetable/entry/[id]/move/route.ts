import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, notFound, conflict as conflictRes, forbidden, zodErrors } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import { allocateHalls, sortHalls } from "@/lib/services/hall-packing";
import { HALL_BOOKING_LOCK_KEY, slotsOverlap } from "@/lib/services/exam-slots";
import { z } from "zod";
import type { RouteContext } from "@/lib/route-types";

const bodySchema = z.object({
  newTimeSlotId: z.string().uuid(),
});

/** Raised inside the transaction when the target slot no longer has room. */
class NoRoomInSlot extends Error {
  constructor(readonly needed: number, readonly free: number) {
    super("No room in slot");
  }
}

/**
 * Moves one DRAFT exam to another time slot. The move is refused when a clashing
 * course (same level, or sharing an enrolled student) already sits in that slot or
 * in a slot overlapping it. Halls and seats are then re-planned for the new slot
 * using only halls that no other exam has booked at that time.
 */
export const PATCH = withHandler(async (
  request: Request,
  ctx: RouteContext<"/api/timetable/entry/[id]/move">
) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;

  const entry = await prisma.timetableEntry.findUnique({
    where: { id },
    include: { course: { select: { id: true, code: true, levelId: true } } },
  });
  if (!entry) return notFound("Timetable entry not found");
  if (entry.status === "PUBLISHED")
    return forbidden("Published exams can't be moved. Reset the timetable first.");

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", zodErrors(parsed.error.issues));

  const { newTimeSlotId } = parsed.data;
  if (newTimeSlotId === entry.timeSlotId) {
    const unchanged = await prisma.timetableEntry.findUnique({
      where: { id },
      include: { course: { select: { id: true, code: true } }, timeSlot: true },
    });
    return ok(unchanged, "The exam is already in that slot");
  }

  const slot = await prisma.timeSlot.findUnique({ where: { id: newTimeSlotId } });
  if (!slot) return notFound("Time slot not found");

  // The target slot plus any slot on that day whose times overlap it.
  const sameDay = await prisma.timeSlot.findMany({ where: { date: slot.date } });
  const concurrentSlotIds = sameDay.filter((s) => s.id === slot.id || slotsOverlap(s, slot)).map((s) => s.id);

  // ── Clash check: courses in the same level, plus any course sharing a student ──
  const enrolments = await prisma.studentCourse.findMany({
    where: { courseId: entry.courseId, session: entry.session, deletedAt: null },
    select: { studentId: true, student: { select: { matricNumber: true } } },
    orderBy: { student: { matricNumber: "asc" } },
  });
  const studentIds = enrolments.map((e) => e.studentId);

  const [sharedStudentCourses, sameLevelCourses] = await Promise.all([
    studentIds.length > 0
      ? prisma.studentCourse.findMany({
          where: {
            studentId: { in: studentIds },
            session: entry.session,
            deletedAt: null,
            courseId: { not: entry.courseId },
          },
          select: { courseId: true },
          distinct: ["courseId"],
        })
      : Promise.resolve([] as { courseId: string }[]),
    prisma.course.findMany({
      where: { levelId: entry.course.levelId, id: { not: entry.courseId } },
      select: { id: true },
    }),
  ]);
  const neighbourCourseIds = [
    ...new Set([...sharedStudentCourses.map((c) => c.courseId), ...sameLevelCourses.map((c) => c.id)]),
  ];

  const clash =
    neighbourCourseIds.length > 0
      ? await prisma.timetableEntry.findFirst({
          where: {
            courseId: { in: neighbourCourseIds },
            session: entry.session,
            timeSlotId: { in: concurrentSlotIds },
          },
          include: { course: { select: { code: true } } },
        })
      : null;
  if (clash) {
    return conflictRes(
      `Moving to this slot clashes with ${clash.course.code} — the same students would have two exams at the same time`
    );
  }

  // ── Re-plan halls and seats in the new slot ──────────────────────────────────
  const [activeHalls, levelHeadcount] = await Promise.all([
    prisma.examHall.findMany({ where: { isActive: true }, select: { id: true, capacity: true } }),
    prisma.student.count({ where: { levelId: entry.course.levelId } }),
  ]);

  // Same headcount rule as generation: enrolled students, else the level's students.
  const headcount = enrolments.length > 0 ? enrolments.length : levelHeadcount;

  try {
    await prisma.$transaction(
      async (tx) => {
        // Serialise with timetable generation and other moves, then read the
        // halls other exams hold at this time.
        await tx.$queryRawUnsafe(`SELECT 1 AS locked FROM pg_advisory_xact_lock(${HALL_BOOKING_LOCK_KEY})`);
        const bookedInSlot = await tx.hallAssignment.findMany({
          where: { timetableEntry: { timeSlotId: { in: concurrentSlotIds }, id: { not: entry.id } } },
          select: { examHallId: true },
        });
        const booked = new Set(bookedInSlot.map((b) => b.examHallId));
        const freeHalls = sortHalls(activeHalls.filter((h) => !booked.has(h.id)));
        const freeSeats = freeHalls.reduce((sum, h) => sum + h.capacity, 0);
        const { allocations, unseated } = allocateHalls(headcount, freeHalls);
        if (headcount > 0 && unseated > 0) throw new NoRoomInSlot(headcount, freeSeats);

        // Seats for enrolled students in matric order; seatEnd records the seats issued.
        const hallRows: { timetableEntryId: string; examHallId: string; seatEnd: number }[] = [];
        const seatRows: { studentId: string; timetableEntryId: string; examHallId: string; seatNumber: number }[] = [];
        let offset = 0;
        for (const a of allocations) {
          const batch = enrolments.slice(offset, offset + a.seats);
          hallRows.push({ timetableEntryId: entry.id, examHallId: a.hallId, seatEnd: batch.length });
          batch.forEach((e, i) => {
            seatRows.push({ studentId: e.studentId, timetableEntryId: entry.id, examHallId: a.hallId, seatNumber: i + 1 });
          });
          offset += a.seats;
        }

        await tx.studentHallAssignment.deleteMany({ where: { timetableEntryId: entry.id } });
        await tx.hallAssignment.deleteMany({ where: { timetableEntryId: entry.id } });
        await tx.hallAssignment.createMany({ data: hallRows });
        await tx.studentHallAssignment.createMany({ data: seatRows });
        await tx.timetableEntry.update({ where: { id: entry.id }, data: { timeSlotId: newTimeSlotId } });
      },
      { maxWait: 10_000, timeout: 20_000 }
    );
  } catch (err) {
    if (err instanceof NoRoomInSlot)
      return conflictRes(
        `Not enough free hall space in that slot — ${err.needed} seat(s) needed, ${err.free} free. Choose another slot.`
      );
    throw err;
  }

  const updated = await prisma.timetableEntry.findUnique({
    where: { id: entry.id },
    include: { course: { select: { id: true, code: true } }, timeSlot: true },
  });
  return ok(updated, "Exam moved — halls and seats re-assigned for the new slot");
});
