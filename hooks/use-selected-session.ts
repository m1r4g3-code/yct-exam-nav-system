"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/query-keys";
import { apiGet } from "@/lib/fetcher";
import { compareSessionsNewestFirst } from "@/lib/sessions";

export interface SessionRecord {
  id: string;
  name: string;
  isActive: boolean;
}

const STORAGE_KEY = "yct_selected_session";
const listeners = new Set<() => void>();
// Fallback when storage is unavailable (private mode, blocked site data): the
// choice then lasts until the page is reloaded.
let memoryValue: string | null = null;

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? memoryValue;
  } catch {
    return memoryValue;
  }
}

function writeStored(value: string) {
  memoryValue = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage unavailable — memoryValue keeps the choice for this page view.
  }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", onStorage);
  };
}

/** Active sessions (visible to students), newest first. */
export function useActiveSessions() {
  return useQuery({
    queryKey: QUERY_KEYS.SESSIONS,
    queryFn: () => apiGet<SessionRecord[]>("/api/sessions"),
    staleTime: 5 * 60 * 1000,
    select: (all) =>
      all
        .filter((s) => s.isActive)
        .sort((a, b) => compareSessionsNewestFirst(a.name, b.name)),
  });
}

/**
 * The session a student is looking at. Defaults to the newest active session and
 * remembers the student's choice (shared by the Timetable and Courses tabs).
 */
export function useSelectedSession() {
  const sessionsQuery = useActiveSessions();
  const stored = useSyncExternalStore(subscribe, readStored, () => null);
  const sessions = sessionsQuery.data ?? [];

  const session =
    stored && sessions.some((s) => s.name === stored) ? stored : (sessions[0]?.name ?? "");

  const setSession = useCallback((name: string) => writeStored(name), []);

  return {
    session,
    setSession,
    sessions,
    isLoading: sessionsQuery.isLoading,
    isError: sessionsQuery.isError,
  };
}
