/**
 * Pure hall selection — shared by the scheduler (to check that a slot has room),
 * the hall planner (to book halls) and the move-entry endpoint, so all three
 * always agree on where a class will sit.
 *
 * Rules:
 * - A hall hosts at most one course per time slot.
 * - Best fit: a class takes the smallest free hall that seats everyone still to
 *   be seated. When no single hall is big enough, it fills the largest free hall
 *   and continues with the rest of the class.
 * - Within a slot, larger classes choose first; classes already known not to
 *   fit ("low priority") choose last so they never push out a class that fits.
 */

export interface HallCapacity {
  id: string;
  capacity: number;
}

export interface HallAllocation {
  hallId: string;
  seats: number;
}

export interface AllocationResult {
  allocations: HallAllocation[];
  unseated: number;
}

export interface SlotCourse {
  id: string;
  headcount: number;
  lowPriority?: boolean;
}

function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Largest capacity first; ties broken by id so results are repeatable. */
export function sortHalls<T extends HallCapacity>(halls: readonly T[]): T[] {
  return [...halls].sort((a, b) => b.capacity - a.capacity || byId(a, b));
}

/**
 * Chooses halls for one class. `freeHalls` must be sorted largest first
 * (see sortHalls); the halls chosen are removed from it.
 */
export function allocateHalls(headcount: number, freeHalls: HallCapacity[]): AllocationResult {
  const allocations: HallAllocation[] = [];
  let remaining = headcount;

  while (remaining > 0 && freeHalls.length > 0) {
    // Scanning from the smallest hall upwards, the first one that fits is the tightest fit.
    let index = 0;
    for (let i = freeHalls.length - 1; i >= 0; i--) {
      if (freeHalls[i].capacity >= remaining) {
        index = i;
        break;
      }
    }
    const [hall] = freeHalls.splice(index, 1);
    const seats = Math.min(remaining, Math.max(0, hall.capacity));
    if (seats > 0) allocations.push({ hallId: hall.id, seats });
    remaining -= seats;
  }

  return { allocations, unseated: Math.max(0, remaining) };
}

/** Seats every course of one time slot in the given halls. */
export function packSlot(
  courses: readonly SlotCourse[],
  halls: readonly HallCapacity[]
): Map<string, AllocationResult> {
  const free = sortHalls(halls);
  const ordered = [...courses].sort(
    (a, b) =>
      Number(a.lowPriority ?? false) - Number(b.lowPriority ?? false) ||
      b.headcount - a.headcount ||
      byId(a, b)
  );
  const result = new Map<string, AllocationResult>();
  for (const course of ordered) result.set(course.id, allocateHalls(course.headcount, free));
  return result;
}

/** True when every course in the slot can be fully seated. */
export function slotFits(courses: readonly SlotCourse[], halls: readonly HallCapacity[]): boolean {
  for (const { unseated } of packSlot(courses, halls).values()) {
    if (unseated > 0) return false;
  }
  return true;
}

/** Total capacity of the halls a slot would still have free after seating its courses. */
export function spareCapacity(courses: readonly SlotCourse[], halls: readonly HallCapacity[]): number {
  const used = new Set<string>();
  for (const { allocations } of packSlot(courses, halls).values()) {
    for (const a of allocations) used.add(a.hallId);
  }
  return halls.reduce((sum, h) => (used.has(h.id) ? sum : sum + h.capacity), 0);
}
