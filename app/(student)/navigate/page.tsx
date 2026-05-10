"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { QUERY_KEYS } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface NavHall {
  id: string;
  name: string;
  code: string;
  description: string | null;
  navigationNode: { id: string } | null;
}

export default function NavigateIndexPage() {
  const { data: halls = [], isLoading } = useQuery<NavHall[]>({
    queryKey: QUERY_KEYS.NAV_HALLS,
    queryFn: async () => {
      const res = await fetch("/api/navigation/halls");
      const json = await res.json();
      return json.data ?? [];
    },
  });

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-50">Navigate</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Select an exam hall to get directions
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-2"
            >
              <Skeleton className="h-5 w-32 bg-zinc-800" />
              <Skeleton className="h-4 w-20 bg-zinc-800" />
              <Skeleton className="h-8 w-24 bg-zinc-800 mt-2" />
            </div>
          ))}
        </div>
      ) : halls.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <MapPin className="size-10 text-zinc-600" />
          <p className="text-zinc-400 text-sm">No exam halls configured yet.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {halls.map((hall) => (
            <div
              key={hall.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3"
            >
              <div>
                <p className="font-semibold text-zinc-50">{hall.name}</p>
                <p className="text-xs text-zinc-500 font-mono">{hall.code}</p>
                {hall.description && (
                  <p className="text-xs text-zinc-400 mt-1 leading-snug">
                    {hall.description}
                  </p>
                )}
              </div>
              {hall.navigationNode ? (
                <Button
                  render={<Link href={`/navigate/${hall.id}`} />}
                  nativeButton={false}
                  size="sm"
                  variant="outline"
                  className="border-zinc-700 text-zinc-200 hover:text-zinc-50"
                >
                  <MapPin className="size-3.5 mr-1" />
                  Navigate
                </Button>
              ) : (
                <span className="text-xs text-zinc-600">No route available</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
