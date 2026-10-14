import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, conflict as conflictRes, serverError, partial, zodErrors } from "@/lib/api-response";
import { buildLevelConflictGraphSync } from "@/lib/services/graph-builder";
import { runDsatur } from "@/lib/services/timetable-generator";
import { planHallAssignments } from "@/lib/services/hall-assigner";
import { ensureExamSlots } from "@/lib/services/slot-manager";
import {
  DEFAULT_EXAM_WEEKS,
  HALL_BOOKING_LOCK_KEY,
  MAX_EXAM_WEEKS,
  occupancyBySlot,
  withoutOverlaps,
} from "@/lib/services/exam-slots";
import { sessionSemester } from "@/lib/sessions";
import { z } from "zod";

// Generating a whole college's timetable can take a while — allow up to a minute.
export const maxDuration = 60;

const bodySchema = z.object({
  session: z.string().min(1, "session is required"),
  force: z.boolean().optional().default(false),
  schoolId: z.string().uuid().optional(),
  examStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD")
    .optional(),
  examWeeks: z
    .number()
    .int()
    .min(1, "The exam period must be at least 1 week")
    .max(MAX_EXAM_WEEKS, `The exam period can be at most ${MAX_EXAM_WEEKS} weeks`)
    .optional()
    .default(DEFAULT_EXAM_WEEKS),
});

// Postgres max params = 65,535; studentHallAssignment has 4 fields → ~16k rows max.
// Use 5k per batch for safety.
const STUDENT_BATCH = 5_000;

const toDateString = (d: Date) => d.toISOString().slice(0, 10);

/** Raised inside the commit when another timetable booked a planned hall meanwhile. */
class HallBookingConflict extends Error {}

export async function POST(request: Request) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  try {
    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", zodErrors(parsed.error.issues));

    const { session, force, schoolId, examStartDate, examWeeks } = parsed.data;

    const semester = sessionSemester(session);
    if (!semester)
      return badRequest(`Session "${session}" must end with "First Semester" or "Second Semester".`);

    const sessionRecord = await prisma.session.findUnique({ where: { name: session } });
    if (!sessionRecord) return badRequest(`Unknown session: "${session}"`);

    // Per-session lock — prevents two generations for the same session running at
    // once. A lock left behind by an interrupted run (e.g. a platform timeout) is
    // taken over after 10 minutes.
    const lockAcquired = await prisma.$executeRaw`
      INSERT INTO generation_locks (session, started_at) VALUES (${session}, NOW())
      ON CONFLICT (session) DO UPDATE SET started_at = NOW()
      WHERE generation_locks.started_at IS NULL
         OR generation_locks.started_at < NOW() - INTERVAL '10 minutes'
    `;
    if (lockAcquired === 0) {
      return conflictRes(
        "Timetable generation is already in progress for this session. Please wait and try again."
      );
    }

    // Scope conflict checks and force-delete to the selected school only so that
    // generating School A does not block or overwrite School B's entries.
    const schoolCourseFilter = schoolId
      ? { level: { programme: { department: { schoolId } } } }
      : {};
    const entrySchoolFilter = schoolId ? { course: schoolCourseFilter } : {};

    try {
      const publishedEntry = await prisma.timetableEntry.findFirst({
        where: { session, status: "PUBLISHED", ...entrySchoolFilter },
        select: { id: true },
      });
      if (publishedEntry)
        return conflictRes(
          "This session's timetable has already been published. Reset this session's timetable first."
        );

      const existingDraft = await prisma.timetableEntry.findFirst({
        where: { session, status: "DRAFT", ...entrySchoolFilter },
        select: { id: true },
      });
      if (existingDraft && !force)
        return conflictRes(
          "A draft timetable already exists for this session. Pass force=true to regenerate."
        );

      // ── Courses and halls first, so a run with nothing to schedule changes nothing ──
      const [allCourses, activeHalls] = await Promise.all([
        prisma.course.findMany({
          where: { semester, ...schoolCourseFilter },
          select: { id: true, levelId: true },
        }),
        prisma.examHall.findMany({
          where: { isActive: true },
          select: { id: true, capacity: true },
          orderBy: { capacity: "desc" },
        }),
      ]);

      if (allCourses.length === 0)
        return badRequest(
          `No ${semester.toLowerCase()} semester courses found${schoolId ? " for the selected school" : ""}.`
        );
      if (activeHalls.length === 0) return badRequest("No active exam halls configured.");

      // ── Exam period: create its slots and only use slots inside it ─────────
      const window = examStartDate ? await ensureExamSlots(examStartDate, examWeeks) : null;
      const windowSlots = await prisma.timeSlot.findMany({
        where: window ? { date: { gte: window.from, lte: window.to } } : undefined,
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      });
      // Slots added by hand that overlap another slot are left out of scheduling.
      const slots = withoutOverlaps(windowSlots);
      if (slots.length === 0)
        return badRequest("No exam slots available. Choose an exam start date to create them.");

      // ── Load the rest in parallel — no DB access after this until the commit ─
      const courseIds = allCourses.map((c) => c.id);
      const windowSlotIds = windowSlots.map((s) => s.id);
      const bookingsOfOtherTimetables = (tx: Pick<typeof prisma, "hallAssignment">) =>
        tx.hallAssignment.findMany({
          where: {
            timetableEntry: {
              timeSlotId: { in: windowSlotIds },
              NOT: { session, ...entrySchoolFilter },
            },
          },
          select: { examHallId: true, timetableEntry: { select: { timeSlotId: true } } },
        });

      const [allEnrollments, levelCounts, keptBookings] = await Promise.all([
        prisma.studentCourse.findMany({
          where: { session, deletedAt: null, courseId: { in: courseIds } },
          select: {
            courseId: true,
            student: { select: { id: true, matricNumber: true } },
          },
          orderBy: { student: { matricNumber: "asc" } },
        }),
        prisma.student.groupBy({ by: ["levelId"], _count: { _all: true } }),
        // Halls already booked in these slots by timetables this run keeps
        // (other sessions, and other schools of this session).
        bookingsOfOtherTimetables(prisma),
      ]);

      const toBookings = (rows: typeof keptBookings) =>
        rows.map((b) => ({ slotId: b.timetableEntry.timeSlotId, hallId: b.examHallId }));
      const occupied = occupancyBySlot(slots, windowSlots, toBookings(keptBookings));

      // ── Build in-memory lookup maps ─────────────────────────────────────────
      const courseLevel = new Map(allCourses.map((c) => [c.id, c.levelId]));
      const studentsByLevel = new Map(levelCounts.map((r) => [r.levelId, r._count._all]));

      const enrollmentsByCourse = new Map<
        string,
        { studentId: string; matricNumber: string }[]
      >();
      for (const e of allEnrollments) {
        const arr = enrollmentsByCourse.get(e.courseId) ?? [];
        arr.push({ studentId: e.student.id, matricNumber: e.student.matricNumber });
        enrollmentsByCourse.set(e.courseId, arr);
      }

      // Headcount: enrolled students, or — before anyone has enrolled — the level's students.
      const countByCourse = new Map<string, number>();
      for (const courseId of courseIds) {
        const direct = enrollmentsByCourse.get(courseId)?.length ?? 0;
        if (direct > 0) {
          countByCourse.set(courseId, direct);
        } else {
          const levelId = courseLevel.get(courseId);
          countByCourse.set(courseId, levelId ? (studentsByLevel.get(levelId) ?? 0) : 0);
        }
      }

      const coursesWithStudents = allCourses.filter(
        (c) => (countByCourse.get(c.id) ?? 0) > 0
      );
      if (coursesWithStudents.length === 0)
        return badRequest(
          "No courses with enrolled students found. Enroll students before generating."
        );

      // ── Capacity-aware DSatur scheduling (pure memory) ─────────────────────
      const graph = buildLevelConflictGraphSync(coursesWithStudents);
      const headcount = new Map(coursesWithStudents.map((c) => [c.id, countByCourse.get(c.id) ?? 0]));
      const { assignments, unresolved, overflow } = runDsatur(graph, slots, {
        headcount,
        halls: activeHalls,
        occupied,
      });

      // ── Plan hall + seat assignments (pure memory, UUIDs pre-generated) ────
      const plan = planHallAssignments(
        assignments,
        activeHalls,
        enrollmentsByCourse,
        countByCourse,
        session,
        { occupied, lowPriority: new Set(overflow) }
      );

      // ── Atomic commit: delete old drafts + insert everything in one tx ──────
      // Hall bookings are written by one timetable at a time (across all sessions):
      // the advisory lock serialises commits, and bookings made by others since the
      // plan was computed are re-checked before anything is written.
      const slotOfEntry = new Map(plan.timetableEntries.map((e) => [e.id, e.timeSlotId]));
      try {
        await prisma.$transaction(
          async (tx) => {
            await tx.$queryRawUnsafe(`SELECT 1 AS locked FROM pg_advisory_xact_lock(${HALL_BOOKING_LOCK_KEY})`);

            const latest = occupancyBySlot(slots, windowSlots, toBookings(await bookingsOfOtherTimetables(tx)));
            const taken = plan.hallAssignments.some((h) => {
              const slotId = slotOfEntry.get(h.timetableEntryId);
              return slotId ? (latest.get(slotId)?.has(h.examHallId) ?? false) : false;
            });
            if (taken) throw new HallBookingConflict();

            if (force) await tx.timetableEntry.deleteMany({ where: { session, ...entrySchoolFilter } });
            await tx.timetableEntry.createMany({ data: plan.timetableEntries, skipDuplicates: true });
            await tx.hallAssignment.createMany({ data: plan.hallAssignments, skipDuplicates: true });
            for (let i = 0; i < plan.studentAssignments.length; i += STUDENT_BATCH) {
              await tx.studentHallAssignment.createMany({
                data: plan.studentAssignments.slice(i, i + STUDENT_BATCH),
                skipDuplicates: true,
              });
            }
          },
          { maxWait: 15_000, timeout: 60_000 }
        );
      } catch (err) {
        if (err instanceof HallBookingConflict)
          return conflictRes(
            "Another timetable booked some of the same halls while this one was being generated. Please generate again."
          );
        throw err;
      }

      // ── Enrich unresolved + overflow IDs with readable course info ──────────
      const overflowIds = [...new Set(plan.overflowCourseIds)];
      const enrichIds = [...unresolved, ...overflowIds];
      const courseDetails =
        enrichIds.length > 0
          ? await prisma.course.findMany({
              where: { id: { in: enrichIds } },
              select: { id: true, code: true, title: true },
            })
          : [];
      const detailMap = new Map(courseDetails.map((c) => [c.id, c]));
      const details = (ids: string[]) =>
        ids
          .map((id) => detailMap.get(id))
          .filter((c): c is NonNullable<typeof c> => c !== undefined)
          .sort((a, b) => a.code.localeCompare(b.code));

      const unresolvedDetails = details(unresolved);
      const overflowDetails = details(overflowIds);

      const payload = {
        assigned: assignments.size,
        unresolved: unresolvedDetails,
        overflow: overflowDetails,
        slotsUsed: new Set(assignments.values()).size,
        examPeriod: window ? { from: toDateString(window.from), to: toDateString(window.to) } : null,
      };

      const hasIssues = unresolvedDetails.length > 0 || overflowDetails.length > 0;
      return hasIssues
        ? partial(payload, "Timetable generated with warnings — resolve overflow and unresolved courses before publishing.")
        : ok(payload, "Timetable generated successfully");
    } finally {
      // Release the per-session lock regardless of success or failure
      await prisma.generationLock.delete({ where: { session } }).catch((e) => {
        console.error("[lock-release-error]", e);
      });
    }
  } catch (err) {
    console.error("[timetable/generate]", err);
    return serverError("Timetable generation failed. Please try again.");
  }
}
