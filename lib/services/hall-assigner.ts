import type { ExamHall, PrismaClient } from "../generated/prisma/client";

type TxClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export interface EnrolledStudent {
  student: { id: string; matricNumber: string };
}

export interface HallAssignmentResult {
  timetableEntryId: string;
  hallAssignments: {
    hallId: string;
    hallName: string;
    seatStart: number;
    seatEnd: number;
  }[];
  hallOverflow: boolean;
  enrolledCount: number;
}

/**
 * Assigns enrolled students to exam halls for a single timetable entry.
 * Accepts pre-fetched enrollments (sorted by matricNumber ASC) to avoid
 * per-course queries inside the transaction.
 *
 * Rules:
 * - Halls already booked for this time slot are excluded
 * - Halls sorted capacity DESC (fills largest first)
 * - If total capacity < enrolled count → HALL_OVERFLOW flagged (not an error)
 */
export async function assignHallsForEntry(
  tx: TxClient,
  timetableEntryId: string,
  activeHalls: ExamHall[],
  alreadyBookedHallIds: Set<string>,
  enrollments: EnrolledStudent[],
  estimatedCount = 0
): Promise<HallAssignmentResult> {
  // Use individual enrollment count when available, fall back to level estimate
  const enrolledCount = enrollments.length > 0 ? enrollments.length : estimatedCount;
  const hallAssignments: HallAssignmentResult["hallAssignments"] = [];

  const availableHalls = activeHalls
    .filter((h) => !alreadyBookedHallIds.has(h.id))
    .sort((a, b) => b.capacity - a.capacity);

  let remaining = enrolledCount;
  let studentOffset = 0;

  for (const hall of availableHalls) {
    if (remaining <= 0) break;

    const allocate = Math.min(remaining, hall.capacity);
    const seatStart = 1;
    const seatEnd = allocate;

    await tx.hallAssignment.create({
      data: { timetableEntryId, examHallId: hall.id, seatStart, seatEnd },
    });

    alreadyBookedHallIds.add(hall.id);
    hallAssignments.push({ hallId: hall.id, hallName: hall.name, seatStart, seatEnd });

    // Only create individual seat assignments when enrollment records exist
    if (enrollments.length > 0) {
      const studentsForHall = enrollments.slice(studentOffset, studentOffset + allocate);
      await tx.studentHallAssignment.createMany({
        data: studentsForHall.map((e, idx) => ({
          studentId: e.student.id,
          timetableEntryId,
          examHallId: hall.id,
          seatNumber: seatStart + idx,
        })),
      });
    }

    studentOffset += allocate;
    remaining -= allocate;
  }

  return {
    timetableEntryId,
    hallAssignments,
    hallOverflow: remaining > 0,
    enrolledCount,
  };
}
