import { ok, badRequest, notFound, serverError } from "@/lib/api-response";
import { dijkstra } from "@/lib/services/dijkstra";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) return badRequest("from and to query parameters are required");
  if (from === to) return badRequest("from and to must be different nodes");

  try {
    const result = await dijkstra(from, to);
    if (!result) return notFound("No path found between the specified nodes");
    return ok(result);
  } catch (err) {
    console.error("[navigation/path]", err);
    return serverError("Route calculation failed. Please try again.");
  }
}
