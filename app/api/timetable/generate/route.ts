import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, conflict as conflictRes, serverError, partial } from "@/lib/api-response";
import { buildLevelConflictGraphSync } from "@/lib/services/graph-builder";
import { runDsatur } from "@/lib/services/timetable-generator";
import { planHallAssignments } from "@/lib/services/hall-assigner";
import { ensureExamSlots } from "@/lib/services/slot-manager";
import { z } from "zod";

const bodySchema = z.object({
  session: z.string().min(1, "session is required"),
  force: z.boolean().optional().default(false),
  schoolId: z.string().uuid().optional(),
  examStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD")
    .optional(),
});

function parseSemester(session: string): "FIRST" | "SECOND" {
  const match = session.match(/(First|Second) Semester$/);
  if (!match) throw new Error(`Cannot determine semester from session: "${session}"`);
  return match[1] === "Second" ? "SECOND" : "FIRST";
}

// Postgres max params = 65,535; studentHallAssignment has 4 fields → ~16k rows max.
// Use 5k per batch for safety.
const STUDENT_BATCH = 5_000;

export async function POST(request: Request) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  try {
    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success)
      return badRequest(
        "Validation failed",
        parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
      );

    const { session, force, schoolId, examStartDate } = parsed.data;

    // Validate session exists in the DB
    const sessionRecord = await prisma.session.findUnique({ where: { name: session } });
    if (!sessionRecord) return badRequest(`Unknown session: "${session}"`);

    // ── Per-session DB lock (works across multiple Vercel Function instances) ──
    const lockInserted = await prisma.$executeRaw`
      INSERT INTO generation_locks (session) VALUES (${session})
      ON CONFLICT (session) DO NOTHING
    `;
    if (lockInserted === 0) {
      return conflictRes(
        "Timetable generation is already in progress for this session. Please wait and try again."
      );
    }

    try {
      const existingDraft = await prisma.timetableEntry.findFirst({
        where: { session, status: "DRAFT" },
        select: { id: true },
      });
      if (existingDraft && !force)
        return conflictRes(
          "A draft timetable already exists for this session. Pass force=true to regenerate."
        );

      if (force) {
        const publishedEntry = await prisma.timetableEntry.findFirst({
          where: { session, status: "PUBLISHED" },
          select: { id: true },
        });
        if (publishedEntry)
          return conflictRes(
            "This session's timetable has already been published. Use DELETE /api/timetable/[session]/reset to explicitly reset it first."
          );
      }

      // ── Auto-create exam slots ──────────────────────────────────────────────
      if (examStartDate) {
        await ensureExamSlots(examStartDate);
      }

      // ── Load ALL data in parallel — no DB access after this until the commit ─
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

      // ── Build in-memory lookup maps ─────────────────────────────────────────
      const courseIds = allCourses.map((c) => c.id);
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

      // ── DSatur graph coloring (pure memory) ────────────────────────────────
      const graph = buildLevelConflictGraphSync(coursesWithStudents);
      const { assignments, unresolved } = runDsatur(graph, slots);

      // ── Plan hall + seat assignments (pure memory, UUIDs pre-generated) ────
      const plan = planHallAssignments(
        assignments,
        activeHalls,
        enrollmentsByCourse,
        countByCourse,
        session
      );

      // ── Atomic commit: delete old drafts + insert everything in one tx ──────
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
        ...(force ? [prisma.timetableEntry.deleteMany({ where: { session } })] : []),
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

      // ── Enrich unresolved + overflow IDs with readable course info ──────────
      const enrichIds = [...unresolved, ...plan.overflowCourseIds];
      const courseDetails =
        enrichIds.length > 0
          ? await prisma.course.findMany({
              where: { id: { in: enrichIds } },
              select: { id: true, code: true, title: true },
            })
          : [];
      const detailMap = new Map(courseDetails.map((c) => [c.id, c]));

      const unresolvedDetails = unresolved
        .map((id) => detailMap.get(id))
        .filter((c): c is NonNullable<typeof c> => c !== undefined);
      const overflowDetails = plan.overflowCourseIds
        .map((id) => detailMap.get(id))
        .filter((c): c is NonNullable<typeof c> => c !== undefined);

      const payload = {
        assigned: assignments.size,
        unresolved: unresolvedDetails,
        overflow: overflowDetails,
      };

      const hasIssues = unresolvedDetails.length > 0 || overflowDetails.length > 0;
      return hasIssues
        ? partial(payload, "Timetable generated with warnings — resolve overflow and unresolved courses before publishing.")
        : ok(payload, "Timetable generated successfully");
    } finally {
      // Release the per-session lock regardless of success or failure
      await prisma.generationLock.delete({ where: { session } }).catch(() => {});
    }
  } catch (err) {
    console.error("[timetable/generate]", err);
    return serverError("Timetable generation failed. Please try again.");
  }
}
