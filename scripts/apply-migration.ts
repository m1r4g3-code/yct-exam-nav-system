import { Client } from "pg";
import { readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

const MIGRATION_NAME =
  "20260515100000_add_sessions_generation_lock_drop_seatstart";
const MIGRATION_PATH = join(
  __dirname,
  "..",
  "prisma",
  "migrations",
  MIGRATION_NAME,
  "migration.sql"
);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = readFileSync(MIGRATION_PATH, "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    // Check if already applied
    const existing = await client.query(
      `SELECT 1 FROM _prisma_migrations WHERE migration_name = $1`,
      [MIGRATION_NAME]
    );
    if ((existing.rowCount ?? 0) > 0) {
      console.log("Migration already applied — nothing to do.");
      return;
    }

    console.log("Applying migration…");
    await client.query(sql);
    console.log("SQL executed.");

    await client.query(
      `INSERT INTO _prisma_migrations
         (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       VALUES
         (gen_random_uuid()::text, $1, NOW(), $2, NULL, NULL, NOW(), 1)`,
      [checksum, MIGRATION_NAME]
    );
    console.log("Migration marked as applied.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
