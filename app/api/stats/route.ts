import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";

/** Headline numbers for the admin dashboard. */
export const GET = withHandler(async () => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const [students, courses, activeHalls, activeSessions] = await Promise.all([
    prisma.student.count(),
    prisma.course.count(),
    prisma.examHall.count({ where: { isActive: true } }),
    prisma.session.count({ where: { isActive: true } }),
  ]);

  return ok({ students, courses, activeHalls, activeSessions });
});
