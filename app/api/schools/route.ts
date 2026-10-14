import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, created, badRequest, conflict, zodErrors } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import { z } from "zod";

const schoolSchema = z.object({
  name: z.string().trim().min(2).max(255),
  code: z.string().trim().min(2).max(50).toUpperCase(),
});

export const GET = withHandler(async () => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const schools = await prisma.school.findMany({ orderBy: { name: "asc" } });
  return ok(schools);
});

export const POST = withHandler(async (request: Request) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const body = await request.json().catch(() => null);
  const parsed = schoolSchema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", zodErrors(parsed.error.issues));

  try {
    const school = await prisma.school.create({ data: parsed.data });
    return created(school, "School created");
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") return conflict("School code already exists");
    throw e;
  }
});
