import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, created, badRequest, conflict, zodErrors } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(2).max(255),
  code: z.string().trim().min(2).max(50).toUpperCase(),
  capacity: z.number().int().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  description: z.string().trim().max(1000).optional(),
  isActive: z.boolean().optional().default(true),
});

// Public read. Prisma Decimal coordinates are returned as plain numbers.
export const GET = withHandler(async () => {
  const halls = await prisma.examHall.findMany({ orderBy: [{ capacity: "desc" }, { name: "asc" }] });
  return ok(halls.map((h) => ({ ...h, latitude: Number(h.latitude), longitude: Number(h.longitude) })));
});

export const POST = withHandler(async (request: Request) => {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", zodErrors(parsed.error.issues));

  try {
    const hall = await prisma.examHall.create({ data: parsed.data });
    return created({ ...hall, latitude: Number(hall.latitude), longitude: Number(hall.longitude) }, "Hall created");
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") return conflict("Hall code already exists");
    throw e;
  }
});
