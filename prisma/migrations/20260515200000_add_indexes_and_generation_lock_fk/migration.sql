-- INDEX-1: courses.level_id — used in timetable/me fallback query
--   (course: { levelId: student.levelId }) and in DSatur graph building.
--   Postgres does NOT auto-create indexes for FK columns, only for PK/UNIQUE.
CREATE INDEX IF NOT EXISTS "courses_level_id_idx" ON "courses" ("level_id");

-- INDEX-2: student_courses(student_id, session) — composite index for the
--   "which courses is this student enrolled in for THIS session?" query pattern
--   used in GET /api/enrollments?session=... and timetable/me enrollment lookup.
--   The existing (student_id) single-column index forces an index scan + filter;
--   the composite index satisfies both predicates in a single index-only scan.
CREATE INDEX IF NOT EXISTS "student_courses_student_id_session_idx"
  ON "student_courses" ("student_id", "session");

-- FK-1: generation_locks.session → sessions.name
--   Prevents orphaned lock rows for non-existent sessions. ON DELETE CASCADE
--   so that removing a session also removes any stale lock for it.
ALTER TABLE "generation_locks"
  ADD CONSTRAINT "generation_locks_session_fkey"
  FOREIGN KEY ("session") REFERENCES "sessions" ("name")
  ON DELETE CASCADE ON UPDATE CASCADE;
