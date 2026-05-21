/**
 * One-time cleanup: removes exam halls that don't exist on the YCT campus map.
 * Run with: npx tsx prisma/remove-stale-halls.ts
 */
import "dotenv/config";
import { PrismaClient } from "@/lib/generated/prisma/client";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const STALE_PATH_IDS  = ["path-sot-cbt1", "path-sot-cbt2", "path-sot-mphb", "path-sot-sota", "path-jcta-bdlh"];
const STALE_NODE_IDS  = ["node-hall-cbt1", "node-hall-cbt2", "node-hall-mphb", "node-hall-bdlh", "node-hall-sota"];
const STALE_HALL_CODES = ["CBT1", "CBT2", "MPHB", "BDLH", "SOTA"];

async function main() {
  const paths = await prisma.navigationPath.deleteMany({ where: { id: { in: STALE_PATH_IDS } } });
  console.log(`✓ Deleted ${paths.count} stale navigation paths`);

  const nodes = await prisma.navigationNode.deleteMany({ where: { id: { in: STALE_NODE_IDS } } });
  console.log(`✓ Deleted ${nodes.count} stale navigation nodes`);

  const halls = await prisma.examHall.deleteMany({ where: { code: { in: STALE_HALL_CODES } } });
  console.log(`✓ Deleted ${halls.count} stale exam halls (CBT1, CBT2, MPHB, BDLH, SOTA)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => pool.end());
