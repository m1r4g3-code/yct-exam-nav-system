"use client";

import { createClient } from "@/lib/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/query-keys";
import { useRouter } from "next/navigation";

export type UserRole = "admin" | "superadmin" | "student";

export interface AppUser {
  id: string;
  email: string;
  role: UserRole;
}

export function useUser() {
  const supabase = createClient();

  const { data: user, isLoading } = useQuery({
    queryKey: QUERY_KEYS.USER,
    queryFn: async (): Promise<AppUser | null> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      return {
        id: user.id,
        email: user.email ?? "",
        role: (user.app_metadata?.role as UserRole) ?? "student",
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  return { user: user ?? null, isLoading };
}

export function useLogout() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const router = useRouter();

  return async () => {
    await supabase.auth.signOut();
    queryClient.clear();
    router.push("/login");
  };
}
