export const QUERY_KEYS = {
  // Auth
  USER: ["user"] as const,

  // Hierarchy
  SCHOOLS: ["schools"] as const,
  DEPARTMENTS: (schoolId?: string) => ["departments", schoolId] as const,
  PROGRAMMES: (departmentId?: string) => ["programmes", departmentId] as const,
  LEVELS: (programmeId?: string) => ["levels", programmeId] as const,

  // Courses
  COURSES: (levelId?: string) => ["courses", levelId] as const,
  COURSE: (id: string) => ["course", id] as const,

  // Students
  STUDENTS: ["students"] as const,
  STUDENT: (id: string) => ["student", id] as const,
  MY_ENROLLMENTS: (session?: string) => ["enrollments", "me", session] as const,

  // Halls & Slots
  HALLS: ["halls"] as const,
  SLOTS: ["slots"] as const,

  // Timetable
  TIMETABLE: (session?: string, levelId?: string) =>
    ["timetable", session, levelId] as const,
  MY_TIMETABLE: (session?: string) => ["timetable", "me", session] as const,

  // Navigation
  NAV_HALLS: ["navigation", "halls"] as const,
  NAV_NODES: ["navigation", "nodes"] as const,
  NAV_PATH: (from: string, to: string) => ["navigation", "path", from, to] as const,
} as const;
