"use client";

import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

/** Signs the current user out, forgets all cached data and returns to the sign-in page. */
export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    queryClient.clear();
    router.push("/login");
  };
}
