import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, created, badRequest } from "@/lib/api-response";
import { z } from "zod";

const schoolSchema = z.object({
  name: z.string().min(2).max(255),
  code: z.string().min(2).max(50).toUpperCase(),
});

export async function GET() {
  const schools = await prisma.school.findMany({ orderBy: { name: "asc" } });
  return ok(schools);
}

export async function POST(request: Request) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const body = await request.json().catch(() => null);
  const parsed = schoolSchema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));

  const school = await prisma.school.create({ data: parsed.data }).catch((e) => {
    if (e.code === "P2002") throw new Error("code_exists");
    throw e;
  }).catch((e) => {
    if (e.message === "code_exists") return null;
    throw e;
  });

  if (!school) return badRequest("School code already exists");
  return created(school);
}
