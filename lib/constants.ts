export const VALID_SESSIONS = [
  "2024/2025 First Semester",
  "2024/2025 Second Semester",
] as const

export type Session = (typeof VALID_SESSIONS)[number]

export const DEFAULT_SESSION: Session = VALID_SESSIONS[0]

/** Fallback map center for campus navigation (update to real coords before demo) */
export const MAP_FALLBACK_CENTER: [number, number] = [6.516, 3.39]
