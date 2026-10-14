import { createHash, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { ok, conflict, serverError, badRequest, unauthorized } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import { z } from "zod";

const setupSchema = z.object({
  secret: z.string(),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
  fullName: z.string().trim().min(2),
});

/** Constant-time comparison of the provided secret with ADMIN_SETUP_SECRET. */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * POST /api/admin/setup — one-time creation of the first super-admin sign-in.
 * Protected by ADMIN_SETUP_SECRET, and only works until the first admin account
 * exists; after that, further admins are created by the system administrator.
 */
export const POST = withHandler(async (request: Request) => {
  const body = await request.json().catch(() => null);
  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid request");

  const expected = process.env.ADMIN_SETUP_SECRET;
  if (!expected) {
    return badRequest("Setup endpoint is disabled (ADMIN_SETUP_SECRET not configured)");
  }
  if (!secretMatches(parsed.data.secret, expected)) {
    return unauthorized("Invalid setup secret");
  }

  const alreadySetUp = await prisma.admin.findFirst({
    where: { authUserId: { not: null } },
    select: { id: true },
  });
  if (alreadySetUp) return conflict("Setup has already been completed — an admin account exists.");

  const { email, password, fullName } = parsed.data;
  const supabaseAdmin = createAdminClient();

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    app_metadata: { role: "superadmin" },
    email_confirm: true,
  });

  if (error || !data.user) return serverError(error?.message ?? "Auth user creation failed");

  try {
    await prisma.admin.upsert({
      where: { email },
      update: { authUserId: data.user.id, role: "SUPERADMIN" },
      create: {
        authUserId: data.user.id,
        email,
        fullName,
        role: "SUPERADMIN",
      },
    });
  } catch (err) {
    // Don't leave a sign-in without its admin record
    await supabaseAdmin.auth.admin.deleteUser(data.user.id).catch(() => undefined);
    throw err;
  }

  return ok({ adminId: data.user.id }, "Superadmin setup complete");
});
