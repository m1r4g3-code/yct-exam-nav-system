import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

// Service role client — never expose to the browser.
// Use only in API routes and server-side logic.
export function createAdminClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
