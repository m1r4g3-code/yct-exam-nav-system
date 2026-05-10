import type { TimeSlot } from "../generated/prisma/client";
import type { ConflictGraph } from "./graph-builder";

export interface GeneratorResult {
  assignments: Map<string, string>; // courseId → timeSlotId
  unresolved: string[];             // courseIds that could not be assigned
}

/**
 * DSatur greedy graph coloring for exam timetabling.
 *
 * Selection rule each iteration:
 *   1. Highest saturation degree (most distinct neighbor colors)
 *   2. Tie-break: highest total degree
 *   3. Tie-break: smallest courseId (determinism)
 */
export function runDsatur(
  graph: ConflictGraph,
  slots: TimeSlot[]
): GeneratorResult {
  const { adjacency, degree } = graph;
  const courseIds = Array.from(adjacency.keys());

  if (courseIds.length === 0) {
    return { assignments: new Map(), unresolved: [] };
  }

  // Sort slots chronologically so earlier dates are preferred
  const sortedSlots = [...slots].sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    if (dateA !== dateB) return dateA - dateB;
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });

  const assignments = new Map<string, string>();
  const unresolved: string[] = [];
  const uncolored = new Set(courseIds);

  // saturation[courseId] = set of slot IDs used by its neighbors
  const saturation = new Map<string, Set<string>>(
    courseIds.map((id) => [id, new Set()])
  );

  while (uncolored.size > 0) {
    // Select next course by DSatur criterion
    let next: string | null = null;
    let bestSat = -1;
    let bestDeg = -1;

    for (const id of uncolored) {
      const sat = saturation.get(id)!.size;
      const deg = degree.get(id) ?? 0;

      if (
        sat > bestSat ||
        (sat === bestSat && deg > bestDeg) ||
        (sat === bestSat && deg === bestDeg && (next === null || id < next))
      ) {
        next = id;
        bestSat = sat;
        bestDeg = deg;
      }
    }

    if (!next) break;

    // Find slots already used by this course's neighbors
    const neighborSlots = new Set<string>();
    for (const neighbor of adjacency.get(next) ?? []) {
      const neighborSlot = assignments.get(neighbor);
      if (neighborSlot) neighborSlots.add(neighborSlot);
    }

    // Assign the first available slot
    let assignedSlot: TimeSlot | null = null;
    for (const slot of sortedSlots) {
      if (!neighborSlots.has(slot.id)) {
        assignedSlot = slot;
        break;
      }
    }

    if (!assignedSlot) {
      unresolved.push(next);
    } else {
      assignments.set(next, assignedSlot.id);
      // Update saturation of all neighbors
      for (const neighbor of adjacency.get(next) ?? []) {
        saturation.get(neighbor)?.add(assignedSlot.id);
      }
    }

    uncolored.delete(next);
  }

  return { assignments, unresolved };
}
