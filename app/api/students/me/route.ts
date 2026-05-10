import { prisma } from "@/lib/prisma";
import { requireStudentUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest } from "@/lib/api-response";

export async function GET() {
  const auth = await requireStudentUser();
  if (isErrorResponse(auth)) return auth;

  const student = await prisma.student.findUnique({
    where: { authUserId: auth.id },
    include: {
      level: { select: { id: true, name: true, year: true } },
      programme: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
    },
  });

  if (!student) return badRequest("Student profile not found");
  return ok(student);
}
