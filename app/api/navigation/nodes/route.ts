import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api-response";

export async function GET() {
  const nodes = await prisma.navigationNode.findMany({
    include: {
      examHall: { select: { id: true, name: true, code: true } },
    },
    orderBy: { label: "asc" },
  });

  // Prisma Decimal fields serialize as strings — convert to numbers for Leaflet
  const mapped = nodes.map((n) => ({
    ...n,
    latitude: Number(n.latitude),
    longitude: Number(n.longitude),
  }));

  return ok(mapped);
}
