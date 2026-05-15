-- DH-5: Add CHECK constraints to ensure session strings always match the canonical
-- "YYYY/YYYY (First|Second) Semester" format defined in lib/constants.ts::VALID_SESSIONS.
-- Application-layer validation (z.enum(VALID_SESSIONS)) already enforces this for every
-- API write. These constraints add a DB-level safety net for direct inserts (e.g. seeds,
-- migrations, psql sessions) that bypass the application.
--
-- To apply manually (non-TTY environment — see CLAUDE.md session notes):
--   Execute via pg client pointing at DATABASE_URL (Transaction Pooler, port 6543),
--   then INSERT a row into _prisma_migrations to mark it applied.

ALTER TABLE "timetable_entries"
  ADD CONSTRAINT "chk_timetable_entries_session_format"
  CHECK (session ~ '^[0-9]{4}/[0-9]{4} (First|Second) Semester$');

ALTER TABLE "student_courses"
  ADD CONSTRAINT "chk_student_courses_session_format"
  CHECK (session ~ '^[0-9]{4}/[0-9]{4} (First|Second) Semester$');
