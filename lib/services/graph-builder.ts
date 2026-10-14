export interface ConflictGraph {
  adjacency: Map<string, Set<string>>;
  degree: Map<string, number>;
}

/**
 * Level-based conflict graph: every course is a node, and two courses in the
 * same level are joined by an edge because the same students sit both. A level
 * therefore never has two papers in the same time slot — this protects every
 * student at that level, including those who have not finished enrolling.
 *
 * Synchronous and database-free: the caller passes already-loaded courses.
 */
export function buildLevelConflictGraphSync(
  courses: { id: string; levelId: string }[]
): ConflictGraph {
  const courseIds = courses.map((c) => c.id);
  const byLevel = new Map<string, string[]>();
  for (const c of courses) {
    const arr = byLevel.get(c.levelId) ?? [];
    arr.push(c.id);
    byLevel.set(c.levelId, arr);
  }

  const adjacency = new Map<string, Set<string>>(courseIds.map((id) => [id, new Set()]));
  const degree = new Map<string, number>(courseIds.map((id) => [id, 0]));

  for (const levelCourses of byLevel.values()) {
    for (let i = 0; i < levelCourses.length; i++) {
      for (let j = i + 1; j < levelCourses.length; j++) {
        const a = levelCourses[i];
        const b = levelCourses[j];
        if (!adjacency.get(a)!.has(b)) {
          adjacency.get(a)!.add(b);
          adjacency.get(b)!.add(a);
          degree.set(a, (degree.get(a) ?? 0) + 1);
          degree.set(b, (degree.get(b) ?? 0) + 1);
        }
      }
    }
  }

  return { adjacency, degree };
}
