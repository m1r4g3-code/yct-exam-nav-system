import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, created, badRequest } from "@/lib/api-response";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2).max(255),
  code: z.string().min(2).max(50).toUpperCase(),
  capacity: z.number().int().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  description: z.string().optional(),
});

export async function GET() {
  const halls = await prisma.examHall.findMany({ orderBy: { capacity: "desc" } });
  return ok(halls);
}

export async function POST(request: Request) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));

  try {
    const hall = await prisma.examHall.create({ data: parsed.data });
    return created(hall);
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") return badRequest("Hall code already exists");
    throw e;
  }
}
