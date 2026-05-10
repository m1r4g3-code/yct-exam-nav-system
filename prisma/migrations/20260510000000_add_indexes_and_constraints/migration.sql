-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_student_courses_course_id" ON "student_courses"("course_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_student_courses_session_deleted" ON "student_courses"("session", "deleted_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_timetable_entries_session_status" ON "timetable_entries"("session", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_timetable_entries_time_slot_id" ON "timetable_entries"("time_slot_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_hall_assignments_entry_id" ON "hall_assignments"("timetable_entry_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_hall_assignments_hall_id" ON "hall_assignments"("exam_hall_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_student_hall_assignments_entry_id" ON "student_hall_assignments"("timetable_entry_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_student_hall_assignments_hall_id" ON "student_hall_assignments"("exam_hall_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_navigation_paths_from_node_id" ON "navigation_paths"("from_node_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_navigation_paths_to_node_id" ON "navigation_paths"("to_node_id");

-- AddUniqueConstraint
ALTER TABLE "levels" ADD CONSTRAINT "levels_programme_id_year_key" UNIQUE ("programme_id", "year");

-- AddUniqueConstraint
ALTER TABLE "programmes" ADD CONSTRAINT "programmes_department_id_code_key" UNIQUE ("department_id", "code");
