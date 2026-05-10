import { prisma } from "@/lib/prisma";
import { getAuthUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, forbidden } from "@/lib/api-response";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await getAuthUser();
  if (isErrorResponse(auth)) return auth;

  const { searchParams } = request.nextUrl;
  const session = searchParams.get("session");
  if (!session) return badRequest("session query parameter is required");

  const role = auth.role;

  if (role === "admin" || role === "superadmin") {
    const levelId = searchParams.get("level_id") ?? undefined;

    const assignments = await prisma.studentHallAssignment.findMany({
      where: {
        timetableEntry: {
          session,
          ...(levelId && { course: { levelId } }),
        },
      },
      include: {
        student: { select: { id: true, matricNumber: true, fullName: true } },
        timetableEntry: {
          include: {
            course: { select: { id: true, code: true, title: true } },
            timeSlot: true,
          },
        },
        examHall: { select: { id: true, name: true, code: true } },
      },
      orderBy: [
        { timetableEntry: { timeSlot: { date: "asc" } } },
        { student: { matricNumber: "asc" } },
      ],
    });

    return ok(assignments);
  }

  if (role === "student") {
    const student = await prisma.student.findUnique({ where: { authUserId: auth.id } });
    if (!student) return badRequest("Student profile not found");

    const assignments = await prisma.studentHallAssignment.findMany({
      where: { studentId: student.id, timetableEntry: { session, status: "PUBLISHED" } },
      include: {
        timetableEntry: {
          include: {
            course: { select: { id: true, code: true, title: true } },
            timeSlot: true,
          },
        },
        examHall: {
          select: { id: true, name: true, code: true, latitude: true, longitude: true },
        },
      },
      orderBy: { timetableEntry: { timeSlot: { date: "asc" } } },
    });

    // Decimal lat/lng → number for client consistency
    const mapped = assignments.map((a) => ({
      ...a,
      examHall: {
        ...a.examHall,
        latitude: Number(a.examHall.latitude),
        longitude: Number(a.examHall.longitude),
      },
    }));
    return ok(mapped);
  }

  return forbidden("Insufficient permissions");
}
