import { ok, badRequest, notFound, serverError } from "@/lib/api-response";
import { dijkstra } from "@/lib/services/dijkstra";
import { z } from "zod";
import type { NextRequest } from "next/server";

// Node ids are UUIDs for nodes created through the database, and readable
// identifiers such as "node-main-gate" for the seeded campus graph.
const nodeIdSchema = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);

/** Shortest walking path between two campus graph nodes (Dijkstra). */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) return badRequest("from and to query parameters are required");
  if (!nodeIdSchema.safeParse(from).success || !nodeIdSchema.safeParse(to).success)
    return badRequest("from and to must be valid navigation node ids");
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
