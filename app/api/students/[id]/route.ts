import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, badRequest, conflict, notFound, zodErrors } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { MATRIC_FORMAT_HINT, MATRIC_PATTERN, normaliseMatric } from "@/lib/matric";
import type { RouteContext } from "@/lib/route-types";

export const GET = withHandler(async (_req: Request, ctx: RouteContext<"/api/students/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      level: { select: { id: true, name: true, year: true } },
      programme: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true, schoolId: true } },
      enrollments: {
        where: { deletedAt: null },
        include: { course: { select: { id: true, code: true, title: true } } },
        orderBy: { course: { code: "asc" } },
      },
    },
  });

  if (!student) return notFound("Student not found");
  return ok(student);
});

const updateSchema = z
  .object({
    fullName: z.string().trim().min(2, "Full name must be at least 2 characters").max(255),
    matricNumber: z
      .string()
      .transform(normaliseMatric)
      .pipe(z.string().min(4, "Enter the matric number").regex(MATRIC_PATTERN, MATRIC_FORMAT_HINT)),
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
    levelId: z.string().min(1, "Select a level"),
  })
  .partial();

/** Admin edit: name, matric number, email (also the sign-in email) and level. */
export const PUT = withHandler(async (request: Request, ctx: RouteContext<"/api/students/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", zodErrors(parsed.error.issues));
  const { fullName, matricNumber, email, levelId } = parsed.data;

  const student = await prisma.student.findUnique({
    where: { id },
    select: { id: true, authUserId: true, email: true },
  });
  if (!student) return notFound("Student not found");

  // Uniqueness ignores letter case, and this student's own record.
  const [matricTaken, emailTaken] = await Promise.all([
    matricNumber
      ? prisma.student.findFirst({
          where: { id: { not: id }, matricNumber: { equals: matricNumber, mode: "insensitive" } },
          select: { id: true },
        })
      : null,
    email
      ? prisma.student.findFirst({
          where: { id: { not: id }, email: { equals: email, mode: "insensitive" } },
          select: { id: true },
        })
      : null,
  ]);
  if (matricTaken) return conflict("Matric number already registered to another student");
  if (emailTaken) return conflict("Email already registered to another student");

  // The level decides the programme and department.
  let placement: { levelId: string; programmeId: string; departmentId: string } | undefined;
  if (levelId) {
    const level = await prisma.level.findUnique({
      where: { id: levelId },
      select: { id: true, programmeId: true, programme: { select: { departmentId: true } } },
    });
    if (!level) return badRequest("Selected level does not exist");
    placement = {
      levelId: level.id,
      programmeId: level.programmeId,
      departmentId: level.programme.departmentId,
    };
  }

  // Change the sign-in email first, so the student can always sign in with the email on record.
  const emailChanged = !!email && email.toLowerCase() !== student.email.toLowerCase();
  const supabaseAdmin = emailChanged && student.authUserId ? createAdminClient() : null;
  if (supabaseAdmin && student.authUserId) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(student.authUserId, {
      email,
      email_confirm: true,
    });
    if (error) {
      if (/already (been )?registered|already exists/i.test(error.message))
        return conflict("Email already used by another sign-in account");
      return badRequest(error.message);
    }
  }

  try {
    const updated = await prisma.student.update({
      where: { id },
      data: {
        ...(fullName !== undefined && { fullName }),
        ...(matricNumber !== undefined && { matricNumber }),
        ...(email !== undefined && { email }),
        ...placement,
      },
      include: {
        level: { select: { id: true, name: true, year: true } },
        programme: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true, code: true, schoolId: true } },
      },
    });
    return ok(updated, "Student updated");
  } catch (err) {
    // Put the old sign-in email back so it matches the unchanged record.
    if (supabaseAdmin && student.authUserId) {
      const { error: restoreError } = await supabaseAdmin.auth.admin.updateUserById(student.authUserId, {
        email: student.email,
        email_confirm: true,
      });
      if (restoreError) console.error("[students] failed to restore sign-in email", restoreError);
    }
    throw err;
  }
});

/** Admin delete: the student record (enrolments and seats cascade), then the sign-in account. */
export const DELETE = withHandler(async (_req: Request, ctx: RouteContext<"/api/students/[id]">) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const { id } = await ctx.params;
  const student = await prisma.student.findUnique({
    where: { id },
    select: { id: true, authUserId: true, fullName: true },
  });
  if (!student) return notFound("Student not found");

  await prisma.student.delete({ where: { id } });

  if (student.authUserId) {
    const { error } = await createAdminClient().auth.admin.deleteUser(student.authUserId);
    if (error && !/not.?found/i.test(error.message) && error.status !== 404) {
      console.error("[students] failed to delete sign-in account", error);
      return ok(
        { id },
        `Student deleted, but their sign-in account could not be removed (${error.message}). Remove it in Supabase Auth.`
      );
    }
  }

  return ok({ id }, "Student deleted");
});
