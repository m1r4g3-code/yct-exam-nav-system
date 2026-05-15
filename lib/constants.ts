/**
 * VALID_SESSIONS is kept ONLY for:
 *  1. The Prisma seed (prisma/seed.ts) to bootstrap the sessions DB table
 *  2. The DB CHECK constraint regex reference in migration comments
 *
 * Do NOT use VALID_SESSIONS for runtime API validation or UI dropdowns.
 * Load sessions from GET /api/sessions instead (backed by the sessions table).
 */
export const VALID_SESSIONS = [
  "2024/2025 First Semester",
  "2024/2025 Second Semester",
] as const;

export type Session = (typeof VALID_SESSIONS)[number];

export const DEFAULT_SESSION: Session = VALID_SESSIONS[0];

/** Yabatech campus centre coordinate for the Leaflet map fallback. */
export const MAP_FALLBACK_CENTER: [number, number] = [6.5158, 3.3780];
