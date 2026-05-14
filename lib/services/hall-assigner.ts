import { randomUUID } from "crypto";
import type { ExamHall } from "../generated/prisma/client";

export interface StudentEnrollment {
  studentId: string;
  matricNumber: string;
}

export interface HallPlan {
  timetableEntries: Array<{
    id: string;
    courseId: string;
    timeSlotId: string;
    session: string;
    status: "DRAFT";
  }>;
  hallAssignments: Array<{
    timetableEntryId: string;
    examHallId: string;
    seatStart: number;
    seatEnd: number;
  }>;
  studentAssignments: Array<{
    studentId: string;
    timetableEntryId: string;
    examHallId: string;
    seatNumber: number;
  }>;
  overflowCourseIds: string[];
}

/**
 * Pure in-memory hall assignment planner — no DB access.
 *
 * Rules:
 * - One hall hosts at most ONE course per time slot.
 * - Within a slot, courses are sorted largest-enrollment-first so bigger
 *   classes get first pick of halls.
 * - Seat numbers are local to each hall (1 → allocate). Students are
 *   identified by (hallId, seatNumber) — there is no global seat sequence.
 * - HALL_OVERFLOW is flagged (not thrown) if all halls in a slot are
 *   exhausted before every enrolled student is seated.
 *
 * Call only after all data is pre-fetched outside any transaction.
 */
export function planHallAssignments(
  courseSlotMap: Map<string, string>,                        // courseId → slotId (DSatur output)
  halls: ExamHall[],                                        // active halls, sorted capacity DESC
  enrollmentsByCourse: Map<string, StudentEnrollment[]>,    // courseId → students (matric-sorted)
  countByCourse: Map<string, number>,                       // courseId → estimated headcount fallback
  session: string
): HallPlan {
  const timetableEntries: HallPlan["timetableEntries"] = [];
  const hallAssignments: HallPlan["hallAssignments"] = [];
  const studentAssignments: HallPlan["studentAssignments"] = [];
  const overflowCourseIds: string[] = [];

  // Group courses by their assigned slot
  const coursesBySlot = new Map<string, string[]>();
  for (const [courseId, slotId] of courseSlotMap) {
    const arr = coursesBySlot.get(slotId) ?? [];
    arr.push(courseId);
    coursesBySlot.set(slotId, arr);
  }

  for (const [slotId, coursesInSlot] of coursesBySlot) {
    // Largest-enrollment-first: bigger classes get first pick of halls
    const sortedCourses = [...coursesInSlot].sort((a, b) => {
      const ca = enrollmentsByCourse.get(a)?.length ?? countByCourse.get(a) ?? 0;
      const cb = enrollmentsByCourse.get(b)?.length ?? countByCourse.get(b) ?? 0;
      return cb - ca;
    });

    // Track which halls are already booked for this slot
    const usedHallIds = new Set<string>();

    for (const courseId of sortedCourses) {
      const entryId = randomUUID();
      timetableEntries.push({
        id: entryId,
        courseId,
        timeSlotId: slotId,
        session,
        status: "DRAFT",
      });

      const enrolled = enrollmentsByCourse.get(courseId) ?? [];
      const headcount =
        enrolled.length > 0
          ? enrolled.length
          : (countByCourse.get(courseId) ?? 0);

      // No students at all — create the entry but skip hall booking
      if (headcount === 0) continue;

      const availableHalls = halls.filter((h) => !usedHallIds.has(h.id));
      let remaining = headcount;
      let studentOffset = 0;

      for (const hall of availableHalls) {
        if (remaining <= 0) break;

        const allocate = Math.min(remaining, hall.capacity);

        hallAssignments.push({
          timetableEntryId: entryId,
          examHallId: hall.id,
          seatStart: 1,
          seatEnd: allocate,
        });

        usedHallIds.add(hall.id);

        // Individual seat records only when real enrollment data exists
        if (enrolled.length > 0) {
          const batch = enrolled.slice(studentOffset, studentOffset + allocate);
          for (let i = 0; i < batch.length; i++) {
            studentAssignments.push({
              studentId: batch[i].studentId,
              timetableEntryId: entryId,
              examHallId: hall.id,
              seatNumber: i + 1,
            });
          }
        }

        studentOffset += allocate;
        remaining -= allocate;
      }

      if (remaining > 0) {
        overflowCourseIds.push(courseId);
      }
    }
  }

  return { timetableEntries, hallAssignments, studentAssignments, overflowCourseIds };
}
