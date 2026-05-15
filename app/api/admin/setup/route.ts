import { createAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { ok, conflict, serverError, badRequest, unauthorized } from "@/lib/api-response";
import { z } from "zod";

const setupSchema = z.object({
  secret: z.string(),
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
});

// POST /api/admin/setup — creates the superadmin Supabase Auth user and links it.
// Protected by a setup secret in env. Call once after deployment.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request");

  if (!process.env.ADMIN_SETUP_SECRET) {
    return badRequest("Setup endpoint is disabled (ADMIN_SETUP_SECRET not configured)");
  }
  // ORANGE-5: wrong secret → 401, not 400. HTTP semantics: 400 = bad input, 401 = not authenticated.
  if (parsed.data.secret !== process.env.ADMIN_SETUP_SECRET) {
    return unauthorized("Invalid setup secret");
  }

  const { email, password, fullName } = parsed.data;

  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing?.authUserId) return conflict("Admin already has an auth account");

  const supabaseAdmin = createAdminClient();

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    app_metadata: { role: "superadmin" },
    email_confirm: true,
  });

  if (error || !data.user) return serverError(error?.message ?? "Auth user creation failed");

  await prisma.admin.upsert({
    where: { email },
    update: { authUserId: data.user.id },
    create: {
      authUserId: data.user.id,
      email,
      fullName,
      role: "SUPERADMIN",
    },
  });

  return ok({ adminId: data.user.id }, "Superadmin setup complete");
}
