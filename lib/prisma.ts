import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    // Not thrown: `next build` imports route modules without runtime secrets.
    console.warn(
      "[prisma] DATABASE_URL is not set — database calls will fail. Add it to .env.local (see README → Getting started)."
    );
  }
  const adapter = new PrismaPg({
    connectionString,
    // Serverless: keep pool small — each function instance gets its own pool.
    // 3 connections × N concurrent instances stays well within Supabase limits.
    max: 3,
  });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
