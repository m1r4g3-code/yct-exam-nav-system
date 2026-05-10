import { prisma } from "@/lib/prisma";

export interface ConflictGraph {
  adjacency: Map<string, Set<string>>;
  degree: Map<string, number>;
}

/**
 * Builds a conflict graph where courses are nodes and edges connect
 * courses that share at least one enrolled student.
 *
 * Uses a single JOIN query — no N+1.
 */
export async function buildConflictGraph(
  session: string,
  courseIds: string[]
): Promise<ConflictGraph> {
  if (courseIds.length === 0) {
    return { adjacency: new Map(), degree: new Map() };
  }

  // Load all non-dropped enrollments for the given courses in this session
  const enrollments = await prisma.studentCourse.findMany({
    where: { session, courseId: { in: courseIds }, deletedAt: null },
    select: { studentId: true, courseId: true },
  });

  // Group courses by student
  const studentCourseMap = new Map<string, string[]>();
  for (const e of enrollments) {
    const list = studentCourseMap.get(e.studentId) ?? [];
    list.push(e.courseId);
    studentCourseMap.set(e.studentId, list);
  }

  // Initialize all nodes
  const adjacency = new Map<string, Set<string>>(courseIds.map((id) => [id, new Set()]));
  const degree = new Map<string, number>(courseIds.map((id) => [id, 0]));

  // Build edges: any two courses sharing a student get an edge
  for (const coursesForStudent of studentCourseMap.values()) {
    for (let i = 0; i < coursesForStudent.length; i++) {
      for (let j = i + 1; j < coursesForStudent.length; j++) {
        const a = coursesForStudent[i];
        const b = coursesForStudent[j];

        if (!adjacency.has(a) || !adjacency.has(b)) continue; // out of scope

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
