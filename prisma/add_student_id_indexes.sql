-- Missing student_id indexes identified in audit (2026-05-15)
-- Run this in Supabase SQL Editor or via: npm run db:migrate (from terminal)

CREATE INDEX IF NOT EXISTS "student_courses_student_id_idx"
  ON "student_courses"("student_id");

CREATE INDEX IF NOT EXISTS "student_hall_assignments_student_id_idx"
  ON "student_hall_assignments"("student_id");
