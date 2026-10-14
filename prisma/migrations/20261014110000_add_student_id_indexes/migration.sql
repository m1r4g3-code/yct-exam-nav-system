-- Indexes on student_id for "this student's enrolments / seats" queries.
-- They match the @@index([studentId]) declarations in schema.prisma. IF NOT EXISTS
-- keeps this safe on databases where they were already created by hand.

CREATE INDEX IF NOT EXISTS "student_courses_student_id_idx"
  ON "student_courses"("student_id");

CREATE INDEX IF NOT EXISTS "student_hall_assignments_student_id_idx"
  ON "student_hall_assignments"("student_id");
