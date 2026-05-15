import { prisma } from "@/lib/prisma";

export interface ConflictGraph {
  adjacency: Map<string, Set<string>>;
  degree: Map<string, number>;
}

function buildEdges(courses: { id: string; levelId: string }[]): ConflictGraph {
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

/**
 * Level-based conflict graph: courses in the same level can never share a time
 * slot. Synchronous — expects already-loaded course data to avoid a redundant
 * DB round-trip during timetable generation.
 */
export function buildLevelConflictGraphSync(
  courses: { id: string; levelId: string }[]
): ConflictGraph {
  return buildEdges(courses);
}

/**
 * Async variant — fetches course data then delegates to buildEdges.
 * Use when only courseIds are available (e.g., the move-entry endpoint).
 */
export async function buildLevelConflictGraph(courseIds: string[]): Promise<ConflictGraph> {
  if (courseIds.length === 0) return { adjacency: new Map(), degree: new Map() };

  const courses = await prisma.course.findMany({
    where: { id: { in: courseIds } },
    select: { id: true, levelId: true },
  });

  return buildEdges(courses);
}

/**
 * Enrollment-based conflict graph: courses share an edge when at least one
 * student is enrolled in both. Used as a fallback when explicit enrollments
 * exist (e.g., the move-entry conflict check).
 */
export async function buildConflictGraph(
  session: string,
  courseIds: string[]
): Promise<ConflictGraph> {
  if (courseIds.length === 0) return { adjacency: new Map(), degree: new Map() };

  const enrollments = await prisma.studentCourse.findMany({
    where: { session, courseId: { in: courseIds }, deletedAt: null },
    select: { studentId: true, courseId: true },
  });

  const studentCourseMap = new Map<string, string[]>();
  for (const e of enrollments) {
    const list = studentCourseMap.get(e.studentId) ?? [];
    list.push(e.courseId);
    studentCourseMap.set(e.studentId, list);
  }

  const adjacency = new Map<string, Set<string>>(courseIds.map((id) => [id, new Set()]));
  const degree = new Map<string, number>(courseIds.map((id) => [id, 0]));

  for (const coursesForStudent of studentCourseMap.values()) {
    for (let i = 0; i < coursesForStudent.length; i++) {
      for (let j = i + 1; j < coursesForStudent.length; j++) {
        const a = coursesForStudent[i];
        const b = coursesForStudent[j];
        if (!adjacency.has(a) || !adjacency.has(b)) continue;
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
