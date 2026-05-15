import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  const { pathname } = request.nextUrl;

  const method = request.method;

  // Public paths — no auth required
  const isPublicPath =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/navigation") ||
    (method === "GET" && pathname.startsWith("/api/halls")) ||
    pathname === "/" ||
    // Sessions list — needed for dropdown in login/register forms
    (method === "GET" && pathname.startsWith("/api/sessions")) ||
    // Reference data — public read (needed for register form + course selection)
    (method === "GET" && (
      pathname.startsWith("/api/departments") ||
      pathname.startsWith("/api/programmes") ||
      pathname.startsWith("/api/levels") ||
      pathname.startsWith("/api/courses")
    ));

  if (isPublicPath) return supabaseResponse;

  // No session → redirect to login
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = (user.app_metadata?.role as string) ?? "";

  // Admin page routes (browser navigates to /admin/*) — redirect, never return JSON.
  // A raw JSON 403 shows as plain text in the browser, which confuses users.
  if (pathname.startsWith("/admin")) {
    if (role !== "admin" && role !== "superadmin") {
      const dest = request.nextUrl.clone();
      dest.pathname = role === "student" ? "/dashboard" : "/login";
      if (role !== "student") dest.searchParams.set("redirectTo", pathname);
      return NextResponse.redirect(dest);
    }
  }

  // Admin-only API routes → JSON 403 for non-admins
  const isAdminApiRoute =
    pathname.startsWith("/api/schools") ||
    pathname.startsWith("/api/departments") ||
    pathname.startsWith("/api/slots") ||
    pathname.startsWith("/api/timetable/generate") ||
    // /api/students list/detail — but NOT /api/students/me (own profile)
    (pathname.startsWith("/api/students") && pathname !== "/api/students/me") ||
    // /api/courses mutate — but GET is readable by students
    (pathname.startsWith("/api/courses") && method !== "GET") ||
    // /api/timetable mutate
    (pathname.startsWith("/api/timetable") && method !== "GET");

  if (isAdminApiRoute && role !== "admin" && role !== "superadmin") {
    return NextResponse.json(
      { success: false, data: null, message: "Forbidden" },
      { status: 403 }
    );
  }

  // Student-only API routes — block with 403 JSON.
  // Page routes (/dashboard, /navigate, /profile) are handled by their layouts
  // which already redirect non-students to /admin/dashboard.
  const isStudentApiRoute =
    pathname === "/api/students/me" ||
    pathname.startsWith("/api/enrollments") ||
    pathname.startsWith("/api/timetable/me");

  if (isStudentApiRoute && role !== "student") {
    return NextResponse.json(
      { success: false, data: null, message: "Forbidden" },
      { status: 403 }
    );
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
