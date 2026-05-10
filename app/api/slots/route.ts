import { prisma } from "@/lib/prisma";
import { requireAdminUser, isErrorResponse } from "@/lib/auth";
import { ok, created, badRequest } from "@/lib/api-response";
import { z } from "zod";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM"),
  label: z.string().min(2).max(100),
});

export async function GET() {
  const slots = await prisma.timeSlot.findMany({ orderBy: [{ date: "asc" }, { startTime: "asc" }] });
  return ok(slots);
}

export async function POST(request: Request) {
  const auth = await requireAdminUser();
  if (isErrorResponse(auth)) return auth;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Validation failed", parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })));

  try {
    const slot = await prisma.timeSlot.create({
      data: {
        date: new Date(parsed.data.date),
        startTime: new Date(`1970-01-01T${parsed.data.startTime}:00Z`),
        endTime: new Date(`1970-01-01T${parsed.data.endTime}:00Z`),
        label: parsed.data.label,
      },
    });
    return created(slot);
  } catch (e: any) {
    if (e.code === "P2002") return badRequest("A slot already exists for this date and start time");
    throw e;
  }
}
