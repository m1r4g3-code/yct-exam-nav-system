import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest } from "@/lib/api-response";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { searchParams } = request.nextUrl;
  const session = searchParams.get("session");
  const levelId = searchParams.get("level_id") ?? undefined;

  if (!session) return badRequest("session query parameter is required");

  const entries = await prisma.timetableEntry.findMany({
    where: {
      session,
      ...(levelId && { course: { levelId } }),
    },
    include: {
      course: {
        include: { level: { select: { id: true, name: true, year: true } } },
      },
      timeSlot: true,
      hallAssignments: {
        include: { examHall: { select: { id: true, name: true, code: true, capacity: true } } },
      },
    },
    orderBy: [{ timeSlot: { date: "asc" } }, { timeSlot: { startTime: "asc" } }],
  });

  return ok(entries);
}
