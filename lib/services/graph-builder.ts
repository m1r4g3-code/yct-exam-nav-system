import { prisma } from "@/lib/prisma";

export interface ConflictGraph {
  adjacency: Map<string, Set<string>>;
  degree: Map<string, number>;
}

/**
 * Level-based conflict graph: courses in the same level can never be
 * scheduled at the same time (all students in a level sit the same exams).
 * Does not require any student enrollment records.
 */
export async function buildLevelConflictGraph(
  courseIds: string[]
): Promise<ConflictGraph> {
  if (courseIds.length === 0) {
    return { adjacency: new Map(), degree: new Map() };
  }

  const courses = await prisma.course.findMany({
    where: { id: { in: courseIds } },
    select: { id: true, levelId: true },
  });

  const byLevel = new Map<string, string[]>();
  for (const course of courses) {
    const arr = byLevel.get(course.levelId) ?? [];
    arr.push(course.id);
    byLevel.set(course.levelId, arr);
  }

  const adjacency = new Map<string, Set<string>>(courseIds.map((id) => [id, new Set()]));
  const degree = new Map<string, number>(courseIds.map((id) => [id, 0]));

  for (const levelCourses of byLevel.values()) {
    for (let i = 0; i < levelCourses.length; i++) {
      for (let j = i + 1; j < levelCourses.length; j++) {
        const a = levelCourses[i];
        const b = levelCourses[j];
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

/**
 * Enrollment-based conflict graph: courses share an edge when at least
 * one student is enrolled in both. Used as a fallback when enrollments exist.
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
