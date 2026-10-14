-- Enable Row Level Security on every application table.
--
-- The app reads and writes through Prisma, connected as the table owner, which
-- bypasses RLS — so nothing in the app changes. With RLS on and no policies,
-- Supabase's auto-generated REST API refuses all access for the public "anon"
-- and "authenticated" roles, so the browser-visible anon key can no longer read
-- or modify these tables directly.

ALTER TABLE IF EXISTS "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "generation_locks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "schools" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "admins" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "exam_halls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "time_slots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "navigation_nodes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "departments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "navigation_paths" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "programmes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "levels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "students" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "courses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "student_courses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "timetable_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "hall_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "student_hall_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
