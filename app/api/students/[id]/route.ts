import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, notFound } from "@/lib/api-response";
import type { RouteContext } from "@/lib/route-types";

export async function GET(_req: Request, ctx: RouteContext<"/api/students/[id]">) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      level: { select: { id: true, name: true, year: true } },
      programme: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
      enrollments: {
        where: { deletedAt: null },
        include: { course: { select: { id: true, code: true, title: true } } },
        orderBy: { course: { code: "asc" } },
      },
    },
  });

  if (!student) return notFound("Student not found");
  return ok(student);
}
