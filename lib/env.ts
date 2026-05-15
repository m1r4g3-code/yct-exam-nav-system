import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL:                  z.string().url("DATABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_URL:      z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY:     z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  ADMIN_SETUP_SECRET:            z.string().min(1, "ADMIN_SETUP_SECRET is required"),
});

const _parsed = envSchema.safeParse(process.env);

if (!_parsed.success) {
  const missing = _parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Missing or invalid environment variables:\n${missing}\n\nCheck your .env.local file.`);
}

export const env = _parsed.data;
