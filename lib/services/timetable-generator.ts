import type { ConflictGraph } from "./graph-builder";
import { slotFits, spareCapacity, type HallCapacity, type SlotCourse } from "./hall-packing";

export interface SlotLike {
  id: string;
  date: Date | string;
  startTime: Date | string;
}

/** Hall information that makes the scheduler respect seating capacity. */
export interface CapacityOptions {
  headcount: Map<string, number>; // courseId → students to seat
  halls: HallCapacity[]; // active halls
  occupied?: Map<string, Set<string>>; // slotId → halls already booked there by other timetables
}

export interface GeneratorResult {
  assignments: Map<string, string>; // courseId → timeSlotId
  unresolved: string[]; // no clash-free slot was left
  overflow: string[]; // placed, but no clash-free slot had room for the whole class
}

function chronological(a: SlotLike, b: SlotLike): number {
  const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
  if (dateDiff !== 0) return dateDiff;
  return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
}

/**
 * DSatur greedy graph colouring for exam timetabling (each time slot is a colour).
 *
 * Selection rule each iteration:
 *   1. Highest saturation (most distinct slots already used by clashing courses)
 *   2. Tie-break: highest degree (most clashing courses)
 *   3. Tie-break: largest class (seats big classes while halls are free)
 *   4. Tie-break: smallest courseId (determinism)
 *
 * Slot rule: the earliest slot that holds no clashing course and — when hall
 * capacity is supplied — still has enough free halls to seat the whole class.
 * If no clash-free slot has room, the class goes to the clash-free slot with
 * the most spare hall capacity and is reported as overflow. If there is no
 * clash-free slot at all, the course is reported as unresolved.
 */
export function runDsatur(
  graph: ConflictGraph,
  slots: SlotLike[],
  capacity?: CapacityOptions
): GeneratorResult {
  const { adjacency, degree } = graph;
  const courseIds = Array.from(adjacency.keys());
  const assignments = new Map<string, string>();
  const unresolved: string[] = [];
  const overflow: string[] = [];

  if (courseIds.length === 0) return { assignments, unresolved, overflow };

  const sortedSlots = [...slots].sort(chronological);
  const headcountOf = (id: string) => capacity?.headcount.get(id) ?? 0;

  // Halls each slot can still offer (active halls minus those booked by other timetables).
  const hallsBySlot = new Map<string, HallCapacity[]>();
  if (capacity) {
    for (const slot of sortedSlots) {
      const booked = capacity.occupied?.get(slot.id);
      hallsBySlot.set(
        slot.id,
        booked ? capacity.halls.filter((h) => !booked.has(h.id)) : capacity.halls
      );
    }
  }
  const coursesBySlot = new Map<string, SlotCourse[]>();

  const uncolored = new Set(courseIds);
  const saturation = new Map<string, Set<string>>(courseIds.map((id) => [id, new Set()]));

  while (uncolored.size > 0) {
    let next: string | null = null;
    let bestSat = -1;
    let bestDeg = -1;
    let bestHead = -1;

    for (const id of uncolored) {
      const sat = saturation.get(id)!.size;
      const deg = degree.get(id) ?? 0;
      const head = headcountOf(id);
      if (
        sat > bestSat ||
        (sat === bestSat && deg > bestDeg) ||
        (sat === bestSat && deg === bestDeg && head > bestHead) ||
        (sat === bestSat && deg === bestDeg && head === bestHead && (next === null || id < next))
      ) {
        next = id;
        bestSat = sat;
        bestDeg = deg;
        bestHead = head;
      }
    }
    if (!next) break;
    uncolored.delete(next);

    const neighbourSlots = new Set<string>();
    for (const neighbour of adjacency.get(next) ?? []) {
      const slotId = assignments.get(neighbour);
      if (slotId) neighbourSlots.add(slotId);
    }
    const candidates = sortedSlots.filter((s) => !neighbourSlots.has(s.id));
    if (candidates.length === 0) {
      unresolved.push(next);
      continue;
    }

    let chosen: SlotLike;
    let lowPriority = false;

    if (!capacity) {
      chosen = candidates[0];
    } else {
      const course: SlotCourse = { id: next, headcount: headcountOf(next) };
      const fitting = candidates.find((s) =>
        slotFits([...(coursesBySlot.get(s.id) ?? []), course], hallsBySlot.get(s.id) ?? [])
      );
      if (fitting) {
        chosen = fitting;
      } else {
        // No clash-free slot can seat the whole class: use the one with the most room
        // left (ties: the slot with the fewest exams, so these classes are spread out).
        let best = candidates[0];
        let bestSpare = -1;
        let bestCount = Infinity;
        for (const s of candidates) {
          const inSlot = coursesBySlot.get(s.id) ?? [];
          const spare = spareCapacity(inSlot, hallsBySlot.get(s.id) ?? []);
          if (spare > bestSpare || (spare === bestSpare && inSlot.length < bestCount)) {
            best = s;
            bestSpare = spare;
            bestCount = inSlot.length;
          }
        }
        chosen = best;
        lowPriority = true;
        overflow.push(next);
      }
      const list = coursesBySlot.get(chosen.id) ?? [];
      list.push({ id: next, headcount: headcountOf(next), lowPriority });
      coursesBySlot.set(chosen.id, list);
    }

    assignments.set(next, chosen.id);
    for (const neighbour of adjacency.get(next) ?? []) {
      saturation.get(neighbour)?.add(chosen.id);
    }
  }

  return { assignments, unresolved, overflow };
}
