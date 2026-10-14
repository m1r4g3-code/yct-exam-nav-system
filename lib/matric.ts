/**
 * Matric numbers are typed by students, so the same number can arrive as
 * "f/nd/24/3210001 " or "F/ND/24/3210001". Normalise before storing or comparing.
 */
export function normaliseMatric(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Accepts Yabatech-style matric numbers: 3–7 groups of letters/digits separated
 * by "/" or "-", e.g. F/ND/24/3210001, F/HD/21/3210001, YCT/ND/COM/24/0001.
 */
export const MATRIC_PATTERN = /^[A-Z0-9]+(?:[/-][A-Z0-9]+){2,6}$/;

export function isValidMatric(value: string): boolean {
  return MATRIC_PATTERN.test(normaliseMatric(value));
}

export const MATRIC_FORMAT_HINT = "Use your matric number as issued, e.g. F/ND/24/3210001";
