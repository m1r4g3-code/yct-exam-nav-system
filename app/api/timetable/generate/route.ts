import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, conflict as conflictRes } from "@/lib/api-response";
import { buildConflictGraph } from "@/lib/services/graph-builder";
import { runDsatur } from "@/lib/services/timetable-generator";
import { assignHallsForEntry, type EnrolledStudent } from "@/lib/services/hall-assigner";
import { z } from "zod";

const bodySchema = z.object({
  session: z.string().min(4),
  force: z.boolean().optional().default(false),
});

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

  const rows = await prisma.studentCourse.findMany({
    where: { session, deletedAt: null },
    select: { courseId: true },
    distinct: ["courseId"],
  });
  const courseIds = rows.map((r) => r.courseId);

  if (courseIds.length === 0) return badRequest("No active enrollments found for this session");

  const [slots, activeHalls] = await Promise.all([
    prisma.timeSlot.findMany({ orderBy: [{ date: "asc" }, { startTime: "asc" }] }),
    prisma.examHall.findMany({ where: { isActive: true }, orderBy: { capacity: "desc" } }),
  ]);

  if (slots.length === 0) return badRequest("No time slots configured");
  if (activeHalls.length === 0) return badRequest("No active exam halls configured");

  const graph = await buildConflictGraph(session, courseIds);
  const { assignments, unresolved } = runDsatur(graph, slots);

  // Pre-fetch all enrollments for the session in one query — avoids N per-course
  // queries inside the transaction (one per course → one total)
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
  const alreadyBookedHallIds = new Set<string>();

  await prisma.$transaction(
    async (tx) => {
      for (const [courseId, slotId] of assignments) {
        const entry = await tx.timetableEntry.create({
          data: { courseId, timeSlotId: slotId, session, status: "DRAFT" },
        });

        const result = await assignHallsForEntry(
          tx,
          entry.id,
          activeHalls,
          alreadyBookedHallIds,
          enrollmentsByCourse.get(courseId) ?? []
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
