import { randomUUID } from "crypto";
import { packSlot, type HallCapacity, type SlotCourse } from "./hall-packing";

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

export interface PlanOptions {
  occupied?: Map<string, Set<string>>; // slotId → halls already booked there by other timetables
  lowPriority?: Set<string>; // courses the scheduler already knows won't fully fit — seated last
}

/**
 * Pure in-memory hall and seat planner — no DB access, ids pre-generated so the
 * whole plan can be saved in one transaction.
 *
 * Rules (see hall-packing.ts):
 * - A hall hosts at most ONE course per time slot, and halls already booked in
 *   that slot by another timetable (another school or session) are never reused.
 * - Within a slot, larger classes choose first; each takes the best-fitting free hall.
 * - Seat numbers are local to each hall (1 → seatEnd), in matric-number order.
 *   Students are identified by (hall, seat number) — there is no global sequence.
 * - A course whose class can't be fully seated is reported in overflowCourseIds.
 */
export function planHallAssignments(
  courseSlotMap: Map<string, string>, // courseId → slotId (scheduler output)
  halls: HallCapacity[], // active halls
  enrollmentsByCourse: Map<string, StudentEnrollment[]>, // courseId → students (matric-sorted)
  countByCourse: Map<string, number>, // courseId → headcount fallback
  session: string,
  options: PlanOptions = {}
): HallPlan {
  const timetableEntries: HallPlan["timetableEntries"] = [];
  const hallAssignments: HallPlan["hallAssignments"] = [];
  const studentAssignments: HallPlan["studentAssignments"] = [];
  const overflowCourseIds: string[] = [];

  const coursesBySlot = new Map<string, string[]>();
  for (const [courseId, slotId] of courseSlotMap) {
    const arr = coursesBySlot.get(slotId) ?? [];
    arr.push(courseId);
    coursesBySlot.set(slotId, arr);
  }

  for (const [slotId, coursesInSlot] of coursesBySlot) {
    const booked = options.occupied?.get(slotId);
    const freeHalls = booked ? halls.filter((h) => !booked.has(h.id)) : halls;

    const slotCourses: SlotCourse[] = coursesInSlot.map((courseId) => {
      const enrolled = enrollmentsByCourse.get(courseId)?.length ?? 0;
      return {
        id: courseId,
        headcount: enrolled > 0 ? enrolled : (countByCourse.get(courseId) ?? 0),
        lowPriority: options.lowPriority?.has(courseId) ?? false,
      };
    });
    const packing = packSlot(slotCourses, freeHalls);

    for (const course of slotCourses) {
      const entryId = randomUUID();
      timetableEntries.push({
        id: entryId,
        courseId: course.id,
        timeSlotId: slotId,
        session,
        status: "DRAFT",
      });

      if (course.headcount === 0) continue;

      const { allocations, unseated } = packing.get(course.id) ?? { allocations: [], unseated: course.headcount };
      const enrolled = enrollmentsByCourse.get(course.id) ?? [];
      let studentOffset = 0;

      for (const { hallId, seats } of allocations) {
        // Individual seats only when real enrolment data exists. seatEnd records the
        // seats actually issued, so students who enrol later are numbered from there
        // and can use the rest of the booked hall.
        const batch = enrolled.slice(studentOffset, studentOffset + seats);
        hallAssignments.push({ timetableEntryId: entryId, examHallId: hallId, seatEnd: batch.length });

        batch.forEach((student, i) => {
          studentAssignments.push({
            studentId: student.studentId,
            timetableEntryId: entryId,
            examHallId: hallId,
            seatNumber: i + 1,
          });
        });
        studentOffset += seats;
      }

      if (unseated > 0) overflowCourseIds.push(course.id);
    }
  }

  return { timetableEntries, hallAssignments, studentAssignments, overflowCourseIds };
}
