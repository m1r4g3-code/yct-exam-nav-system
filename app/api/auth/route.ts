import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { ok, badRequest, unauthorized, serverError } from "@/lib/api-response";
import { z } from "zod";

// GET /api/auth — return current session user
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return unauthorized();

  const role = user.app_metadata?.role;

  let profile = null;
  if (role === "student") {
    profile = await prisma.student.findUnique({
      where: { authUserId: user.id },
      select: { id: true, fullName: true, matricNumber: true, levelId: true, departmentId: true, programmeId: true },
    });
  } else if (role === "admin" || role === "superadmin") {
    profile = await prisma.admin.findUnique({
      where: { authUserId: user.id },
      select: { id: true, fullName: true, role: true },
    });
  }

  return ok({ id: user.id, email: user.email, role, profile });
}

// POST /api/auth/logout
export async function DELETE() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) return serverError(error.message);
  return ok(null, "Logged out");
}
