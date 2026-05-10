import { createAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { created, badRequest, conflict, serverError } from "@/lib/api-response";
import { z } from "zod";

const registerSchema = z.object({
  matricNumber: z.string().min(4, "Enter your matric number"),
  fullName: z.string().min(2).max(255),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  levelId: z.string().min(1),
  programmeId: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("Validation failed", parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));
  }

  const { matricNumber, fullName, email, password, levelId, programmeId } = parsed.data;

  // Check matric + email uniqueness before creating auth user
  const existing = await prisma.student.findFirst({
    where: { OR: [{ matricNumber }, { email }] },
  });
  if (existing?.matricNumber === matricNumber) return conflict("Matric number already registered");
  if (existing?.email === email) return conflict("Email already registered");

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
    return serverError(authError?.message ?? "Failed to create auth account");
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
}
