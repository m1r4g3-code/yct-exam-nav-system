import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, created, badRequest, serverError } from "@/lib/api-response";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().regex(
    /^[0-9]{4}\/[0-9]{4} (First|Second) Semester$/,
    'Format must be "YYYY/YYYY First Semester" or "YYYY/YYYY Second Semester"'
  ),
  isActive: z.boolean().optional().default(true),
});

export async function GET() {
  try {
    const sessions = await prisma.session.findMany({
      orderBy: [{ name: "desc" }],
    });
    const res = ok(sessions);
    res.headers.set("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    return res;
  } catch (err) {
    console.error("[route-error]", err);
    return serverError();
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser();
    if (isErrorResponse(auth)) return auth;

    const body = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success)
      return badRequest(
        "Validation failed",
        parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
      );

    const existing = await prisma.session.findUnique({ where: { name: parsed.data.name } });
    if (existing) return badRequest(`Session "${parsed.data.name}" already exists`);

    const session = await prisma.session.create({
      data: { name: parsed.data.name, isActive: parsed.data.isActive },
    });
    return created(session, `Session "${session.name}" created`);
  } catch (err) {
    console.error("[route-error]", err);
    return serverError();
  }
}
