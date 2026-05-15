-- ARCH-1: sessions table replaces the hardcoded VALID_SESSIONS constant.
-- Admins can now add new academic sessions without a code change + redeploy.
--
-- ARCH-2: generation_locks table provides a per-session advisory lock that
-- works across multiple Vercel Function instances (replaces module-level boolean).
--
-- DB-5: drop seat_start from hall_assignments — it was always 1 and carried no
-- information. seatEnd alone captures "how many seats were allocated in this hall."
--
-- To apply manually (non-TTY environment — see CLAUDE.md session notes):
--   Execute via pg client pointing at DATABASE_URL (Transaction Pooler, port 6543),
--   then INSERT a row into _prisma_migrations to mark it applied.
--   Then run: npm run db:generate

CREATE TABLE "sessions" (
  "id"         TEXT        NOT NULL,
  "name"       TEXT        NOT NULL,
  "is_active"  BOOLEAN     NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sessions_name_key" ON "sessions"("name");

-- Seed the two existing sessions so existing timetable_entries remain valid
INSERT INTO "sessions" ("id", "name", "is_active") VALUES
  (gen_random_uuid()::text, '2024/2025 First Semester',  true),
  (gen_random_uuid()::text, '2024/2025 Second Semester', true);

CREATE TABLE "generation_locks" (
  "session"    TEXT        NOT NULL,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "generation_locks_pkey" PRIMARY KEY ("session")
);

ALTER TABLE "hall_assignments" DROP COLUMN "seat_start";
