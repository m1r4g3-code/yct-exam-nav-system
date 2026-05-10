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
  schoolId: z.string().uuid().optional(),
  examStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD")
    .optional(),
});

function parseSemester(session: string): "FIRST" | "SECOND" {
  return session.toLowerCase().includes("second") ? "SECOND" : "FIRST";
}

/** Creates 20 weekday slots (Morning + Afternoon) starting from startDateStr. */
async function ensureExamSlots(startDateStr: string): Promise<void> {
  const SLOT_TIMES = [
    { start: "08:00", end: "10:00", label: "Morning" },
    { start: "12:00", end: "14:00", label: "Afternoon" },
  ];

  const origin = new Date(startDateStr + "T00:00:00Z");
  const toCreate: {
    date: Date;
    startTime: Date;
    endTime: Date;
    label: string;
  }[] = [];

  let weekdays = 0;
  let offset = 0;

  while (weekdays < 20) {
    const current = new Date(origin);
    current.setUTCDate(origin.getUTCDate() + offset);
    offset++;
    const dow = current.getUTCDay();
    if (dow === 0 || dow === 6) continue; // skip weekend

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

  const { session, force, schoolId, examStartDate } = parsed.data;

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

  // Auto-create exam slots if a start date is provided.
  // Orphaned slots (no timetable entries) are cleared first for a clean slate.
  if (examStartDate) {
    await prisma.timeSlot.deleteMany({ where: { timetableEntries: { none: {} } } });
    await ensureExamSlots(examStartDate);
  }

  const semester = parseSemester(session);

  // Filter courses by school if requested
  const courseWhere = {
    semester,
    ...(schoolId
      ? { level: { programme: { department: { schoolId } } } }
      : {}),
  };

  const allCourses = await prisma.course.findMany({
    where: courseWhere,
    select: { id: true, levelId: true },
  });

  if (allCourses.length === 0)
    return badRequest(
      `No ${semester.toLowerCase()} semester courses found${schoolId ? " for the selected school" : ""}`
    );

  const courseIds = allCourses.map((c) => c.id);
  const courseLevel = new Map(allCourses.map((c) => [c.id, c.levelId]));

  const [slots, activeHalls] = await Promise.all([
    prisma.timeSlot.findMany({ orderBy: [{ date: "asc" }, { startTime: "asc" }] }),
    prisma.examHall.findMany({ where: { isActive: true }, orderBy: { capacity: "desc" } }),
  ]);

  if (slots.length === 0)
    return badRequest(
      "No exam slots available. Provide an examStartDate to auto-generate slots."
    );
  if (activeHalls.length === 0) return badRequest("No active exam halls configured");

  // Level-based conflict graph: courses in the same level cannot share a slot
  const graph = await buildLevelConflictGraph(courseIds);
  const { assignments, unresolved } = runDsatur(graph, slots);

  // Pre-fetch level → student count for hall capacity estimation
  const levelCounts = await prisma.student.groupBy({
    by: ["levelId"],
    _count: { _all: true },
  });
  const studentsByLevel = new Map(levelCounts.map((r) => [r.levelId, r._count._all]));

  // Pre-fetch individual enrollments for this session
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

  const overflowCourseIds: string[] = [];
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

        if (result.hallOverflow) overflowCourseIds.push(courseId);
      }
    },
    { timeout: 60_000 }
  );

  // Resolve courseIds → {code, title} for the response
  const [unresolvedCourses, overflowCourses] = await Promise.all([
    unresolved.length > 0
      ? prisma.course.findMany({
          where: { id: { in: unresolved } },
          select: { code: true, title: true },
        })
      : [],
    overflowCourseIds.length > 0
      ? prisma.course.findMany({
          where: { id: { in: overflowCourseIds } },
          select: { code: true, title: true },
        })
      : [],
  ]);

  return ok(
    { assigned: assignments.size, unresolved: unresolvedCourses, overflow: overflowCourses },
    "Timetable generated successfully"
  );
}
