import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api-response";

export async function GET() {
  const halls = await prisma.examHall.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      code: true,
      latitude: true,
      longitude: true,
      description: true,
      navigationNode: { select: { id: true } },
    },
    orderBy: { name: "asc" },
  });

  // Prisma Decimal fields serialize as strings — convert to numbers for Leaflet
  const mapped = halls.map((h) => ({
    ...h,
    latitude: Number(h.latitude),
    longitude: Number(h.longitude),
  }));

  return ok(mapped);
}
