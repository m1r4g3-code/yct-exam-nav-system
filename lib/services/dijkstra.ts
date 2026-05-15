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
    graph.get(path.toNodeId)!.push({ to: path.fromNodeId, weight: dist, polyline: [...coords].reverse() });
  }

  cachedGraph = graph;
  return graph;
}

export function invalidateNavCache() {
  cachedGraph = null;
}

// ── O(log N) min-heap priority queue ────────────────────────────────────────

class MinHeap {
  private data: [number, string][] = [];

  get size() { return this.data.length; }

  push(item: [number, string]) {
    this.data.push(item);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): [number, string] | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(i: number) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.data[parent][0] <= this.data[i][0]) break;
      [this.data[parent], this.data[i]] = [this.data[i], this.data[parent]];
      i = parent;
    }
  }

  private sinkDown(i: number) {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.data[left][0] < this.data[smallest][0]) smallest = left;
      if (right < n && this.data[right][0] < this.data[smallest][0]) smallest = right;
      if (smallest === i) break;
      [this.data[smallest], this.data[i]] = [this.data[i], this.data[smallest]];
      i = smallest;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function dijkstra(sourceId: string, targetId: string): Promise<PathResult | null> {
  const graph = await loadGraph();

  if (!graph.has(sourceId) || !graph.has(targetId)) return null;
  if (sourceId === targetId) return { nodeIds: [sourceId], polylines: [], totalDistance: 0 };

  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const prevEdge = new Map<string, number[][]>();
  const heap = new MinHeap();

  for (const id of graph.keys()) dist.set(id, Infinity);
  dist.set(sourceId, 0);
  prev.set(sourceId, null);
  heap.push([0, sourceId]);

  while (heap.size > 0) {
    const [d, u] = heap.pop()!;

    if (d > (dist.get(u) ?? Infinity)) continue;
    if (u === targetId) break;

    for (const edge of graph.get(u) ?? []) {
      const alt = d + edge.weight;
      if (alt < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, alt);
        prev.set(edge.to, u);
        prevEdge.set(edge.to, edge.polyline);
        heap.push([alt, edge.to]);
      }
    }
  }

  if ((dist.get(targetId) ?? Infinity) === Infinity) return null;

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
