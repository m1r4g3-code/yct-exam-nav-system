import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, created, badRequest, conflict, zodErrors } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import { compareSessionsNewestFirst, isValidSessionName } from "@/lib/sessions";
import { z } from "zod";

const createSchema = z.object({
  name: z
    .string()
    .refine(
      isValidSessionName,
      'Format must be "YYYY/YYYY First Semester" or "YYYY/YYYY Second Semester", with consecutive years'
    ),
  isActive: z.boolean().optional().default(true),
});

/** All sessions, newest first (later academic years first; Second Semester before First). */
export const GET = withHandler(async () => {
  const sessions = await prisma.session.findMany();
  sessions.sort((a, b) => compareSessionsNewestFirst(a.name, b.name));
  return ok(sessions);
});

export const POST = withHandler(async (request: Request) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", zodErrors(parsed.error.issues));

  const existing = await prisma.session.findUnique({ where: { name: parsed.data.name } });
  if (existing) return conflict(`Session "${parsed.data.name}" already exists`);

  const session = await prisma.session.create({
    data: { name: parsed.data.name, isActive: parsed.data.isActive },
  });
  return created(session, `Session "${session.name}" created`);
});
