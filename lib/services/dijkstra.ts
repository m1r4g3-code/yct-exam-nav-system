import { prisma } from "@/lib/prisma";

export interface PathResult {
  nodeIds: string[];
  polylines: number[][];
  totalDistance: number;
}

type Edge = { to: string; weight: number; polyline: number[][] };
type Graph = Map<string, Edge[]>;

let cachedGraph: Graph | null = null;

async function loadGraph(): Promise<Graph> {
  if (cachedGraph) return cachedGraph;

  const paths = await prisma.navigationPath.findMany({
    select: { fromNodeId: true, toNodeId: true, distanceMeters: true, pathCoordinates: true },
  });

  const graph: Graph = new Map();

  for (const path of paths) {
    const dist = Number(path.distanceMeters);
    const coords = path.pathCoordinates as number[][];

    if (!graph.has(path.fromNodeId)) graph.set(path.fromNodeId, []);
    if (!graph.has(path.toNodeId)) graph.set(path.toNodeId, []);

    graph.get(path.fromNodeId)!.push({ to: path.toNodeId, weight: dist, polyline: coords });
    // Reverse direction
    graph.get(path.toNodeId)!.push({ to: path.fromNodeId, weight: dist, polyline: [...coords].reverse() });
  }

  cachedGraph = graph;
  return graph;
}

export function invalidateNavCache() {
  cachedGraph = null;
}

export async function dijkstra(sourceId: string, targetId: string): Promise<PathResult | null> {
  const graph = await loadGraph();

  if (!graph.has(sourceId) || !graph.has(targetId)) return null;
  if (sourceId === targetId) return { nodeIds: [sourceId], polylines: [], totalDistance: 0 };

  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const prevEdge = new Map<string, number[][]>();

  // Sorted-array priority queue: [distance, nodeId]
  const queue: [number, string][] = [[0, sourceId]];

  for (const id of graph.keys()) dist.set(id, Infinity);
  dist.set(sourceId, 0);
  prev.set(sourceId, null);

  while (queue.length > 0) {
    queue.sort((a, b) => a[0] - b[0]);
    const [d, u] = queue.shift()!;

    if (d > (dist.get(u) ?? Infinity)) continue;
    if (u === targetId) break;

    for (const edge of graph.get(u) ?? []) {
      const alt = d + edge.weight;
      if (alt < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, alt);
        prev.set(edge.to, u);
        prevEdge.set(edge.to, edge.polyline);
        queue.push([alt, edge.to]);
      }
    }
  }

  if ((dist.get(targetId) ?? Infinity) === Infinity) return null;

  // Reconstruct path
  const nodeIds: string[] = [];
  const polylines: number[][] = [];
  let cur: string | null | undefined = targetId;

  while (cur !== null && cur !== undefined) {
    nodeIds.unshift(cur);
    const edge = prevEdge.get(cur);
    if (edge) polylines.unshift(...edge);
    cur = prev.get(cur);
  }

  return { nodeIds, polylines, totalDistance: dist.get(targetId)! };
}
