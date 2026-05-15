import { prisma } from "@/lib/prisma";
import { requireStudentUser, isErrorResponse } from "@/lib/auth";
import { ok, notFound, serverError } from "@/lib/api-response";

export async function GET() {
  try {
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

    if (!student) return notFound("Student profile not found");
    return ok(student);
  } catch (err) {
    console.error("[route-error]", err);
    return serverError();
  }
}
