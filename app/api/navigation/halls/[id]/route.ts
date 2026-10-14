import { prisma } from "@/lib/prisma";
import { ok, notFound } from "@/lib/api-response";
import { withHandler } from "@/lib/with-handler";
import type { RouteContext } from "@/lib/route-types";

/**
 * One exam hall for the student map. Returned even when the hall has since been
 * deactivated, so a published timetable that points at it still shows directions.
 */
export const GET = withHandler(async (_request: Request, ctx: RouteContext<"/api/navigation/halls/[id]">) => {
  const { id } = await ctx.params;

  const hall = await prisma.examHall.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      code: true,
      description: true,
      latitude: true,
      longitude: true,
      isActive: true,
    },
  });
  if (!hall) return notFound("Hall not found");

  // Prisma Decimal fields serialize as strings — convert to numbers for Leaflet
  return ok({ ...hall, latitude: Number(hall.latitude), longitude: Number(hall.longitude) });
});
