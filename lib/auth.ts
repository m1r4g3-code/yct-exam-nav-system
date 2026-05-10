import { createClient } from "@/lib/supabase/server";
import { forbidden, unauthorized } from "@/lib/api-response";

export type Role = "admin" | "superadmin" | "student";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

/** Validates the current session and returns the auth user, or a 401 Response. */
export async function getAuthUser(): Promise<AuthUser | Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return unauthorized();

  const role = (user.app_metadata?.role as Role) ?? null;
  if (!role) return unauthorized("No role assigned");

  return { id: user.id, email: user.email ?? "", role };
}

/** Returns a 403 if the user does not have an admin role. */
export async function requireAdminUser(): Promise<AuthUser | Response> {
  const result = await getAuthUser();
  if (result instanceof Response) return result;
  if (result.role !== "admin" && result.role !== "superadmin") return forbidden();
  return result;
}

/** Returns a 403 if the user does not have a superadmin role. */
export async function requireSuperAdmin(): Promise<AuthUser | Response> {
  const result = await getAuthUser();
  if (result instanceof Response) return result;
  if (result.role !== "superadmin") return forbidden();
  return result;
}

/** Returns a 403 if the user is not a student. */
export async function requireStudentUser(): Promise<AuthUser | Response> {
  const result = await getAuthUser();
  if (result instanceof Response) return result;
  if (result.role !== "student") return forbidden();
  return result;
}

/** Type guard — check if the result of a require* function is a Response (early return). */
export function isErrorResponse(val: AuthUser | Response): val is Response {
  return val instanceof Response;
}
