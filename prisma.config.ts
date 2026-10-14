import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Load .env.local first (Next.js convention), fall back to .env
config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // `npx prisma db seed` and `prisma migrate reset` run this
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // DIRECT_URL bypasses pgBouncer — required for migrate dev/deploy
    url: process.env.DIRECT_URL,
  },
});
