import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, conflict as conflictRes, serverError } from "@/lib/api-response";
import { buildLevelConflictGraphSync } from "@/lib/services/graph-builder";
import { runDsatur } from "@/lib/services/timetable-generator";
import { planHallAssignments } from "@/lib/services/hall-assigner";
import { VALID_SESSIONS } from "@/lib/constants";
import { z } from "zod";

const bodySchema = z.object({
  // YELLOW-1: constrained to VALID_SESSIONS to prevent invisible-to-students timetables
  session: z.enum(VALID_SESSIONS as unknown as [string, ...string[]]),
  force: z.boolean().optional().default(false),
  schoolId: z.string().uuid().optional(),
  examStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD")
    .optional(),
});

function parseSemester(session: string): "FIRST" | "SECOND" {
  return session.includes("Second Semester") ? "SECOND" : "FIRST";
}

/**
 * Creates 20 weekday slots (Morning + Afternoon) from startDateStr.
 * Skips weekends. Orphaned slots are deleted first for a clean calendar.
 */
async function ensureExamSlots(startDateStr: string): Promise<void> {
  const SLOT_TIMES = [
    { start: "08:00", end: "10:00", label: "Morning" },
    { start: "12:00", end: "14:00", label: "Afternoon" },
  ];

  const origin = new Date(startDateStr + "T00:00:00Z");
  const toCreate: { date: Date; startTime: Date; endTime: Date; label: string }[] = [];
  let weekdays = 0;
  let offset = 0;

  while (weekdays < 20) {
    const current = new Date(origin);
    current.setUTCDate(origin.getUTCDate() + offset);
    offset++;
    const dow = current.getUTCDay();
    if (dow === 0 || dow === 6) continue;

    const dateLabel = current.toLocaleDateString("en-NG", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });

    for (const t of SLOT_TIMES) {
      toCreate.push({
        date: current,
        startTime: new Date(`1970-01-01T${t.start}:00Z`),
        endTime: new Date(`1970-01-01T${t.end}:00Z`),
        label: `${dateLabel} ${t.label}`,
      });
    }
    weekdays++;
  }

  await prisma.timeSlot.createMany({ data: toCreate, skipDuplicates: true });
}

// Postgres max params = 65,535; studentHallAssignment has 4 fields → ~16k rows max.
// Use 5k per batch for safety.
const STUDENT_BATCH = 5_000;

// YELLOW-3: Single-process generation lock. For multi-instance deployments (e.g. multiple
// Vercel Function replicas), replace with a Redis SET NX lock or pg_try_advisory_xact_lock.
let generationInProgress = false;

export async function POST(request: Request) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  if (generationInProgress) {
    return conflictRes("Timetable generation is already in progress. Please wait and try again.");
  }
  generationInProgress = true;

  try {
    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success)
      return badRequest(
        "Validation failed",
        parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
      );

    const { session, force, schoolId, examStartDate } = parsed.data;

    // ── Race-condition guard ──────────────────────────────────────────────────
    const existingDraft = await prisma.timetableEntry.findFirst({
      where: { session, status: "DRAFT" },
      select: { id: true },
    });
    if (existingDraft && !force)
      return conflictRes(
        "A draft timetable already exists for this session. Pass force=true to regenerate."
      );

    // RED-1 fix: delete ALL entries (DRAFT and PUBLISHED) — not just DRAFT.
    // Filtering by status: "DRAFT" here left PUBLISHED entries alive, causing
    // skipDuplicates to silently drop the new course assignments for those entries,
    // producing a half-regenerated timetable with no error returned.
    if (force)
      await prisma.timetableEntry.deleteMany({ where: { session } });

    // ── Auto-create exam slots ────────────────────────────────────────────────
    if (examStartDate) {
      await prisma.timeSlot.deleteMany({ where: { timetableEntries: { none: {} } } });
      await ensureExamSlots(examStartDate);
    }

    // ── Load ALL data in parallel — no DB access after this until the commit ──
    const semester = parseSemester(session);
    const courseWhere = {
      semester,
      ...(schoolId ? { level: { programme: { department: { schoolId } } } } : {}),
    };

    const [allCourses, slots, activeHalls, allEnrollments, levelCounts] =
      await Promise.all([
        prisma.course.findMany({
          where: courseWhere,
          select: { id: true, levelId: true },
        }),
        prisma.timeSlot.findMany({
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
        }),
        // Sorted capacity DESC — planHallAssignments fills largest halls first
        prisma.examHall.findMany({
          where: { isActive: true },
          orderBy: { capacity: "desc" },
        }),
        prisma.studentCourse.findMany({
          where: { session, deletedAt: null },
          select: {
            courseId: true,
            student: { select: { id: true, matricNumber: true } },
          },
          orderBy: { student: { matricNumber: "asc" } },
        }),
        prisma.student.groupBy({ by: ["levelId"], _count: { _all: true } }),
      ]);

    if (allCourses.length === 0)
      return badRequest(
        `No ${semester.toLowerCase()} semester courses found${schoolId ? " for the selected school" : ""}.`
      );
    if (slots.length === 0)
      return badRequest(
        "No exam slots available. Provide an examStartDate to auto-generate slots."
      );
    if (activeHalls.length === 0)
      return badRequest("No active exam halls configured.");

    // ── Build in-memory lookup maps ───────────────────────────────────────────
    const courseIds = allCourses.map((c) => c.id);
    const courseLevel = new Map(allCourses.map((c) => [c.id, c.levelId]));
    const studentsByLevel = new Map(levelCounts.map((r) => [r.levelId, r._count._all]));

    // enrollments are already ordered by matricNumber ASC
    const enrollmentsByCourse = new Map<
      string,
      { studentId: string; matricNumber: string }[]
    >();
    for (const e of allEnrollments) {
      const arr = enrollmentsByCourse.get(e.courseId) ?? [];
      arr.push({ studentId: e.student.id, matricNumber: e.student.matricNumber });
      enrollmentsByCourse.set(e.courseId, arr);
    }

    // Headcount per course: real enrollment count, fall back to level aggregate
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

    // YELLOW-2: exclude courses with no students (zero direct enrollment AND zero
    // level headcount). These courses would consume a DSatur slot without hosting
    // any students, wasting capacity for real courses.
    const coursesWithStudents = allCourses.filter(
      (c) => (countByCourse.get(c.id) ?? 0) > 0
    );
    if (coursesWithStudents.length === 0)
      return badRequest(
        "No courses with enrolled students found. Enroll students before generating."
      );

    // ── DSatur graph coloring (pure memory) ───────────────────────────────────
    const graph = buildLevelConflictGraphSync(coursesWithStudents);
    const { assignments, unresolved } = runDsatur(graph, slots);

    // ── Plan hall + seat assignments (pure memory, UUIDs pre-generated) ───────
    const plan = planHallAssignments(
      assignments,
      activeHalls,
      enrollmentsByCourse,
      countByCourse,
      session
    );

    // ── Commit — array-form $transaction: exactly 3+ createMany calls, ────────
    // ── no per-row network overhead, no interactive-tx timeout risk        ────
    const studentBatches = [];
    for (let i = 0; i < plan.studentAssignments.length; i += STUDENT_BATCH) {
      studentBatches.push(
        prisma.studentHallAssignment.createMany({
          data: plan.studentAssignments.slice(i, i + STUDENT_BATCH),
          skipDuplicates: true,
        })
      );
    }

    await prisma.$transaction([
      prisma.timetableEntry.createMany({
        data: plan.timetableEntries,
        skipDuplicates: true,
      }),
      prisma.hallAssignment.createMany({
        data: plan.hallAssignments,
        skipDuplicates: true,
      }),
      ...studentBatches,
    ]);

    // ── Enrich unresolved + overflow IDs with readable course info ────────────
    const enrichIds = [...unresolved, ...plan.overflowCourseIds];
    const courseDetails =
      enrichIds.length > 0
        ? await prisma.course.findMany({
            where: { id: { in: enrichIds } },
            select: { id: true, code: true, title: true },
          })
        : [];
    const detailMap = new Map(courseDetails.map((c) => [c.id, c]));

    return ok(
      {
        assigned: assignments.size,
        unresolved: unresolved
          .map((id) => detailMap.get(id))
          .filter((c): c is NonNullable<typeof c> => c !== undefined),
        overflow: plan.overflowCourseIds
          .map((id) => detailMap.get(id))
          .filter((c): c is NonNullable<typeof c> => c !== undefined),
      },
      "Timetable generated successfully"
    );
  } catch (err) {
    console.error("[timetable/generate]", err);
    return serverError("Timetable generation failed. Please try again.");
  } finally {
    generationInProgress = false;
  }
}
