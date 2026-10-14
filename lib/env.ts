/**
 * Reads a required server-side environment variable, failing with a readable
 * message (instead of an obscure connection error) when it is missing.
 * Checked lazily — at first use — so builds don't need runtime secrets.
 *
 * Browser code must keep reading NEXT_PUBLIC_* variables directly
 * (process.env.NEXT_PUBLIC_…) so Next.js can inline them at build time.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Add it to .env.local (see README → Getting started).`
    );
  }
  return value;
}
