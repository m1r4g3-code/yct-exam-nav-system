import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const isAdminRole = (role: string) => role === "admin" || role === "superadmin";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — must be called before any redirect logic
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Any response other than the pass-through must carry the refreshed session cookies.
  const withSession = <T extends NextResponse>(response: T): T => {
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    return response;
  };
  const redirectTo = (pathname: string, params?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
    return withSession(NextResponse.redirect(url));
  };
  const jsonError = (status: number, message: string) =>
    withSession(NextResponse.json({ success: false, data: null, message }, { status }));

  const { pathname } = request.nextUrl;
  const method = request.method;
  const isApi = pathname.startsWith("/api/");
  const role = (user?.app_metadata?.role as string | undefined) ?? "";
  const homeForRole = isAdminRole(role) ? "/admin/dashboard" : role === "student" ? "/dashboard" : null;

  // Signed-in users don't need the landing, sign-in or sign-up pages — send them home.
  if (user && homeForRole && (pathname === "/" || pathname === "/login" || pathname === "/register")) {
    return redirectTo(homeForRole);
  }

  // Public paths — no auth required
  const isPublicPath =
    pathname === "/" ||
    pathname === "/login" ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/navigation") ||
    // One-time first-admin setup — protected by ADMIN_SETUP_SECRET inside the handler
    (method === "POST" && pathname === "/api/admin/setup") ||
    // Sessions list — needed by the sign-up form
    (method === "GET" && pathname.startsWith("/api/sessions")) ||
    // Reference data — public read (needed for register form + course selection)
    (method === "GET" && (
      pathname.startsWith("/api/halls") ||
      pathname.startsWith("/api/departments") ||
      pathname.startsWith("/api/programmes") ||
      pathname.startsWith("/api/levels") ||
      pathname.startsWith("/api/courses")
    ));

  if (isPublicPath) return supabaseResponse;

  // No session → pages go to sign-in (and come back afterwards); API calls get JSON 401.
  if (!user) {
    if (isApi) return jsonError(401, "Your session has expired. Please sign in again.");
    return redirectTo("/login", { redirectTo: pathname + request.nextUrl.search });
  }

  // Admin page routes (browser navigates to /admin/*) — redirect, never return JSON.
  // A raw JSON 403 shows as plain text in the browser, which confuses users.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!isAdminRole(role)) {
      if (role === "student") return redirectTo("/dashboard");
      return redirectTo("/login", { redirectTo: pathname });
    }
    if (pathname === "/admin") return redirectTo("/admin/dashboard");
  }

  // Admin-only API routes → JSON 403 for non-admins
  const isAdminApiRoute =
    pathname.startsWith("/api/schools") ||
    pathname.startsWith("/api/departments") ||
    pathname.startsWith("/api/slots") ||
    pathname.startsWith("/api/stats") ||
    pathname.startsWith("/api/timetable/generate") ||
    // /api/students list/detail — but NOT /api/students/me (own profile)
    (pathname.startsWith("/api/students") && pathname !== "/api/students/me") ||
    // /api/courses mutate — but GET is readable by students
    (pathname.startsWith("/api/courses") && method !== "GET") ||
    // /api/timetable mutate
    (pathname.startsWith("/api/timetable") && method !== "GET");

  if (isAdminApiRoute && !isAdminRole(role)) return jsonError(403, "Forbidden");

  // Student-only API routes — block with 403 JSON.
  // Page routes (/dashboard, /navigate, /profile) are handled by their layouts
  // which already redirect non-students to /admin/dashboard.
  const isStudentApiRoute =
    pathname === "/api/students/me" ||
    pathname.startsWith("/api/enrollments") ||
    pathname.startsWith("/api/timetable/me");

  // /api/assignments is role-aware (admin gets all, student gets own) — requires auth but
  // must NOT be in isStudentApiRoute (admins also call it). Auth is enforced inside the handler.

  if (isStudentApiRoute && role !== "student") return jsonError(403, "Forbidden");

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
