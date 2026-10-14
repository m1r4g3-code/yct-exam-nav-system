import { createAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { created, badRequest, conflict, serverError, zodErrors } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import { MATRIC_FORMAT_HINT, MATRIC_PATTERN, normaliseMatric } from "@/lib/matric";
import { z } from "zod";

const registerSchema = z.object({
  matricNumber: z
    .string()
    .transform(normaliseMatric)
    .pipe(z.string().min(4, "Enter your matric number").regex(MATRIC_PATTERN, MATRIC_FORMAT_HINT)),
  fullName: z.string().trim().min(2).max(255),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  levelId: z.string().min(1),
  programmeId: z.string().min(1),
});

export const POST = withHandler(async (request: Request) => {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", zodErrors(parsed.error.issues));

  const { matricNumber, fullName, email, password, levelId, programmeId } = parsed.data;

  // Check matric + email uniqueness (ignoring letter case) before creating the sign-in account
  const [matricTaken, emailTaken] = await Promise.all([
    prisma.student.findFirst({
      where: { matricNumber: { equals: matricNumber, mode: "insensitive" } },
      select: { id: true },
    }),
    prisma.student.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    }),
  ]);
  if (matricTaken) return conflict("Matric number already registered");
  if (emailTaken) return conflict("Email already registered");

  // Validate level belongs to programme; derive departmentId from programme
  const level = await prisma.level.findUnique({
    where: { id: levelId },
    include: { programme: { include: { department: true } } },
  });
  if (!level) return badRequest("Invalid level");
  if (level.programmeId !== programmeId) return badRequest("Level does not belong to the selected programme");
  const departmentId = level.programme.departmentId;

  const supabaseAdmin = createAdminClient();

  // Create Supabase Auth user and set role in app_metadata
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    app_metadata: { role: "student" },
    email_confirm: true,
  });

  if (authError || !authData.user) {
    const message = authError?.message ?? "Failed to create the sign-in account";
    if (/already (been )?registered|already exists/i.test(message))
      return conflict("Email already registered");
    return serverError(message);
  }

  try {
    const student = await prisma.student.create({
      data: {
        authUserId: authData.user.id,
        matricNumber,
        fullName,
        email,
        levelId,
        departmentId,
        programmeId,
      },
    });

    return created({ studentId: student.id }, "Registration successful");
  } catch {
    // Roll back Supabase auth user if DB insert fails
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    return serverError("Registration failed — please try again");
  }
});
