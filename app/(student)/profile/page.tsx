"use client";

import { useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/query-keys";
import { apiGet, errorMessage } from "@/lib/fetcher";
import { useLogout } from "@/hooks/use-user";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogOut, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface StudentProfile {
  id: string;
  matricNumber: string;
  fullName: string;
  email: string;
  programme: { name: string; code: string };
  level: { name: string; year: number };
  department: { name: string; code: string };
}

const AVATARS = [
  "🎓", "📚", "💻", "🔬", "⚗️", "🧪",
  "📐", "🔭", "🎯", "🏅", "🌟", "🚀",
  "🦁", "🐯", "🦊", "🐧", "🦋", "🐻",
];

// One avatar per account — students may share a phone or computer.
const AVATAR_STORAGE_PREFIX = "yct_profile_avatar:";
const LEGACY_AVATAR_KEY = "yct_profile_avatar";
const avatarListeners = new Set<() => void>();

function avatarKey(email: string): string {
  return `${AVATAR_STORAGE_PREFIX}${email.trim().toLowerCase()}`;
}

function readAvatar(email: string): string {
  if (!email) return "";
  try {
    return window.localStorage.getItem(avatarKey(email)) ?? "";
  } catch {
    return "";
  }
}

function writeAvatar(email: string, emoji: string) {
  try {
    if (emoji) window.localStorage.setItem(avatarKey(email), emoji);
    else window.localStorage.removeItem(avatarKey(email));
    // The old key was shared by everyone who signed in on this browser.
    window.localStorage.removeItem(LEGACY_AVATAR_KEY);
  } catch {
    // Storage unavailable (private mode, blocked site data) — the choice isn't kept.
  }
  avatarListeners.forEach((notify) => notify());
}

function subscribeAvatar(notify: () => void) {
  avatarListeners.add(notify);
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith(AVATAR_STORAGE_PREFIX)) notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    avatarListeners.delete(notify);
    window.removeEventListener("storage", onStorage);
  };
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
      <span className="text-xs text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <span className="text-sm text-foreground/80">{value}</span>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 pt-4 pb-6">
        <Skeleton className="size-20 rounded-full" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Separator />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="py-2 space-y-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-52" />
        </div>
      ))}
    </div>
  );
}

export default function ProfilePage() {
  const logout = useLogout();
  const [pickerOpen, setPickerOpen] = useState(false);

  const {
    data: profile,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: QUERY_KEYS.STUDENT("me"),
    queryFn: () => apiGet<StudentProfile>("/api/students/me"),
  });

  const email = profile?.email ?? "";
  const selectedAvatar = useSyncExternalStore(
    subscribeAvatar,
    () => readAvatar(email),
    () => ""
  );

  function handleAvatarSelect(emoji: string) {
    if (email) writeAvatar(email, emoji);
    setPickerOpen(false);
  }

  function clearAvatar() {
    if (email) writeAvatar(email, "");
    setPickerOpen(false);
  }

  return (
    <div className="min-h-screen bg-background px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-xl font-semibold text-foreground mb-6">Profile</h1>

      <div className="mx-auto max-w-lg rounded-xl border border-border bg-card overflow-hidden">
        {isPending ? (
          <div className="p-6"><ProfileSkeleton /></div>
        ) : isError ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm font-medium text-destructive">Couldn&apos;t load your profile</p>
            <p className="text-xs text-muted-foreground mt-1">{errorMessage(error)}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            {/* Brand gradient header */}
            <div className="bg-gradient-to-br from-brand/15 to-brand/5 px-6 pt-8 pb-6 flex flex-col items-center gap-3 border-b border-border">
              <div className="relative group">
                <div className="flex size-20 items-center justify-center rounded-full bg-background/80 border-2 border-brand/30 select-none text-4xl shadow-sm">
                  {selectedAvatar || (
                    <span className="text-2xl font-semibold text-foreground/80">
                      {getInitials(profile.fullName)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setPickerOpen(true)}
                  className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Change avatar"
                >
                  <Pencil className="size-4 text-white" />
                </button>
              </div>
              <button
                onClick={() => setPickerOpen(true)}
                className="text-[10px] text-brand/70 hover:text-brand transition-colors uppercase tracking-wide"
              >
                Change avatar
              </button>
              <div className="text-center">
                <h2 className="text-xl font-semibold text-foreground">
                  {profile.fullName}
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {profile.matricNumber}
                </p>
              </div>
              {/* Programme chip */}
              <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 text-brand text-xs font-medium px-3 py-1">
                {profile.programme.code} · {profile.level.name}
              </span>
            </div>

            <div className="px-6 pt-6">
              {/* Info rows */}
              <div className="divide-y divide-border/60">
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
            </div>
          </>
        )}

        <div className="px-6 pb-6">
          {/* Appearance — the theme switch, also reachable on phones (no top bar there) */}
          <div className="flex items-center justify-between gap-4 border-t border-border/60 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Appearance</span>
              <span className="text-sm text-foreground/80">Light or dark theme</span>
            </div>
            <ThemeToggle className="text-muted-foreground hover:text-foreground" />
          </div>

          <Separator className="mb-5" />

          {/* Sign out — always available, even if the profile didn't load */}
          <Button
            variant="destructive"
            className="w-full"
            onClick={logout}
          >
            <LogOut className="size-4 mr-2" />
            Sign out
          </Button>
        </div>
      </div>

      {/* Avatar picker dialog */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Choose an Avatar</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-6 gap-2 py-2">
            {AVATARS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleAvatarSelect(emoji)}
                className={`flex items-center justify-center size-12 rounded-xl text-2xl transition-colors hover:bg-muted ${
                  selectedAvatar === emoji
                    ? "bg-muted ring-2 ring-brand"
                    : "bg-muted/50"
                }`}
                aria-label={`Select avatar ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
          {selectedAvatar && (
            <button
              onClick={clearAvatar}
              className="text-xs text-muted-foreground hover:text-foreground/80 transition-colors text-center w-full mt-1"
            >
              Remove avatar (use initials)
            </button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
