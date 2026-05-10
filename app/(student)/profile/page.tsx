"use client";

import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/query-keys";
import { useLogout } from "@/hooks/use-user";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { LogOut } from "lucide-react";

interface StudentProfile {
  id: string;
  matricNumber: string;
  fullName: string;
  email: string;
  programme: { name: string; code: string };
  level: { name: string; year: number };
  department: { name: string; code: string };
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join("");
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 py-3">
      <span className="text-xs text-zinc-500 uppercase tracking-wide">
        {label}
      </span>
      <span className="text-sm text-zinc-200">{value}</span>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 pt-4 pb-6">
        <Skeleton className="size-20 rounded-full bg-zinc-800" />
        <Skeleton className="h-6 w-48 bg-zinc-800" />
        <Skeleton className="h-4 w-32 bg-zinc-800" />
      </div>
      <Separator className="bg-zinc-800" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="py-2 space-y-1">
          <Skeleton className="h-3 w-20 bg-zinc-800" />
          <Skeleton className="h-4 w-52 bg-zinc-800" />
        </div>
      ))}
    </div>
  );
}

export default function ProfilePage() {
  const logout = useLogout();

  const { data: profile, isLoading } = useQuery<StudentProfile>({
    queryKey: QUERY_KEYS.STUDENT("me"),
    queryFn: async () => {
      const res = await fetch("/api/students/me");
      const json = await res.json();
      return json.data;
    },
  });

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-xl font-semibold text-zinc-50 mb-6">Profile</h1>

      <div className="mx-auto max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        {isLoading ? (
          <ProfileSkeleton />
        ) : !profile ? (
          <p className="text-center text-sm text-zinc-500 py-12">
            Could not load profile. Try refreshing.
          </p>
        ) : (
          <>
            {/* Avatar + name */}
            <div className="flex flex-col items-center gap-3 pt-2 pb-6">
              <div className="flex size-20 items-center justify-center rounded-full bg-zinc-800 text-2xl font-semibold text-zinc-300 select-none">
                {getInitials(profile.fullName)}
              </div>
              <div className="text-center">
                <h2 className="text-xl font-semibold text-zinc-50">
                  {profile.fullName}
                </h2>
                <p className="text-sm text-zinc-400 mt-0.5">
                  {profile.matricNumber}
                </p>
              </div>
            </div>

            <Separator className="bg-zinc-800 mb-1" />

            {/* Info rows */}
            <div className="divide-y divide-zinc-800/60">
              <InfoRow label="Email" value={profile.email} />
              <InfoRow
                label="Programme"
                value={`${profile.programme.name} (${profile.programme.code})`}
              />
              <InfoRow label="Level" value={profile.level.name} />
              <InfoRow
                label="Department"
                value={`${profile.department.name} (${profile.department.code})`}
              />
            </div>

            <Separator className="bg-zinc-800 mt-1 mb-5" />

            {/* Logout */}
            <Button
              variant="destructive"
              className="w-full"
              onClick={logout}
            >
              <LogOut className="size-4 mr-2" />
              Sign out
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
