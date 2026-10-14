import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, notFound, zodErrors } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RouteContext } from "@/lib/route-types";

const resetSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters").max(72, "Password is too long"),
});

/** Admin sets a new sign-in password for a student (e.g. a student who forgot theirs). */
export const POST = withHandler(
  async (request: Request, ctx: RouteContext<"/api/students/[id]/reset-password">) => {
    const auth = await requireAdminUser();
    if (isErrorResponse(auth)) return auth;

    const { id } = await ctx.params;
    const body = await request.json().catch(() => null);
    const parsed = resetSchema.safeParse(body);
    if (!parsed.success) return badRequest("Validation failed", zodErrors(parsed.error.issues));

    const student = await prisma.student.findUnique({
      where: { id },
      select: { id: true, authUserId: true },
    });
    if (!student) return notFound("Student not found");
    if (!student.authUserId) return badRequest("This student does not have a sign-in account");

    const { error } = await createAdminClient().auth.admin.updateUserById(student.authUserId, {
      password: parsed.data.password,
    });
    if (error) return badRequest(error.message);

    return ok({ id: student.id }, "Password updated");
  }
);
