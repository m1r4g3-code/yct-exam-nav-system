import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, conflict as conflictRes } from "@/lib/api-response";
import { buildLevelConflictGraph } from "@/lib/services/graph-builder";
import { runDsatur } from "@/lib/services/timetable-generator";
import { assignHallsForEntry, type EnrolledStudent } from "@/lib/services/hall-assigner";
import { z } from "zod";

const bodySchema = z.object({
  session: z.string().min(4),
  force: z.boolean().optional().default(false),
});

function parseSemester(session: string): "FIRST" | "SECOND" {
  return session.toLowerCase().includes("second") ? "SECOND" : "FIRST";
}

export async function POST(request: Request) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success)
    return badRequest(
      "Validation failed",
      parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
    );

  const { session, force } = parsed.data;

  const existingDraft = await prisma.timetableEntry.findFirst({
    where: { session, status: "DRAFT" },
    select: { id: true },
  });

  if (existingDraft && !force) {
    return conflictRes(
      "Draft timetable already exists for this session. Pass force=true to regenerate."
    );
  }

  if (force) {
    await prisma.timetableEntry.deleteMany({ where: { session, status: "DRAFT" } });
  }

  // Derive semester from session label so we only schedule the right courses
  const semester = parseSemester(session);

  const allCourses = await prisma.course.findMany({
    where: { semester },
    select: { id: true, levelId: true },
  });

  if (allCourses.length === 0)
    return badRequest(`No ${semester.toLowerCase().replace("_", " ")} semester courses found`);

  const courseIds = allCourses.map((c) => c.id);
  const courseLevel = new Map(allCourses.map((c) => [c.id, c.levelId]));

  const [slots, activeHalls] = await Promise.all([
    prisma.timeSlot.findMany({ orderBy: [{ date: "asc" }, { startTime: "asc" }] }),
    prisma.examHall.findMany({ where: { isActive: true }, orderBy: { capacity: "desc" } }),
  ]);

  if (slots.length === 0) return badRequest("No time slots configured");
  if (activeHalls.length === 0) return badRequest("No active exam halls configured");

  // Level-based conflict graph: courses in same level cannot share a time slot
  const graph = await buildLevelConflictGraph(courseIds);
  const { assignments, unresolved } = runDsatur(graph, slots);

  // Pre-fetch level → student count for hall capacity estimation
  const levelCounts = await prisma.student.groupBy({
    by: ["levelId"],
    _count: { _all: true },
  });
  const studentsByLevel = new Map(levelCounts.map((r) => [r.levelId, r._count._all]));

  // Pre-fetch individual enrollments for this session (may be empty — that is fine)
  const allEnrollments = await prisma.studentCourse.findMany({
    where: { session, deletedAt: null },
    include: { student: { select: { id: true, matricNumber: true } } },
    orderBy: { student: { matricNumber: "asc" } },
  });
  const enrollmentsByCourse = new Map<string, EnrolledStudent[]>();
  for (const e of allEnrollments) {
    const arr = enrollmentsByCourse.get(e.courseId) ?? [];
    arr.push(e);
    enrollmentsByCourse.set(e.courseId, arr);
  }

  const overflows: string[] = [];
  // Track booked halls PER SLOT — halls in different slots are independent
  const alreadyBookedBySlot = new Map<string, Set<string>>();

  await prisma.$transaction(
    async (tx) => {
      for (const [courseId, slotId] of assignments) {
        const entry = await tx.timetableEntry.create({
          data: { courseId, timeSlotId: slotId, session, status: "DRAFT" },
        });

        if (!alreadyBookedBySlot.has(slotId)) {
          alreadyBookedBySlot.set(slotId, new Set());
        }
        const slotBookings = alreadyBookedBySlot.get(slotId)!;

        const enrolledStudents = enrollmentsByCourse.get(courseId) ?? [];
        const levelId = courseLevel.get(courseId);
        const estimatedCount =
          enrolledStudents.length === 0 && levelId
            ? (studentsByLevel.get(levelId) ?? 0)
            : 0;

        const result = await assignHallsForEntry(
          tx,
          entry.id,
          activeHalls,
          slotBookings,
          enrolledStudents,
          estimatedCount
        );

        if (result.hallOverflow) overflows.push(courseId);
      }
    },
    { timeout: 60_000 }
  );

  return ok(
    { assigned: assignments.size, unresolved, overflows },
    "Timetable generated successfully"
  );
}
