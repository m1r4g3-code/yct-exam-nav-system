/** Session names look like "2025/2026 First Semester" or "2025/2026 Second Semester". */
export const SESSION_NAME_PATTERN = /^(\d{4})\/(\d{4}) (First|Second) Semester$/;

export type Semester = "FIRST" | "SECOND";

/** Returns the semester a session name refers to, or null if the name is not in the standard format. */
export function sessionSemester(name: string): Semester | null {
  const match = SESSION_NAME_PATTERN.exec(name);
  if (!match) return null;
  return match[3] === "Second" ? "SECOND" : "FIRST";
}

/** True when the name follows the format and the second year directly follows the first. */
export function isValidSessionName(name: string): boolean {
  const match = SESSION_NAME_PATTERN.exec(name);
  if (!match) return false;
  return Number(match[2]) === Number(match[1]) + 1;
}

/**
 * Orders sessions newest first: later academic years first, and within a year
 * the Second Semester (which comes later in time) before the First.
 */
export function compareSessionsNewestFirst(a: string, b: string): number {
  const ma = SESSION_NAME_PATTERN.exec(a);
  const mb = SESSION_NAME_PATTERN.exec(b);
  if (!ma || !mb) return b.localeCompare(a);
  const yearDiff = Number(mb[1]) - Number(ma[1]);
  if (yearDiff !== 0) return yearDiff;
  const rank = (m: RegExpExecArray) => (m[3] === "Second" ? 2 : 1);
  return rank(mb) - rank(ma);
}
