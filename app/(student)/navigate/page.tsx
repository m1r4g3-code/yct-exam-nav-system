"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Building2, MapPin, Navigation } from "lucide-react";
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-5 min-h-[160px]"
            >
              <div className="flex items-start gap-3 flex-1">
                <Skeleton className="size-10 rounded-lg bg-zinc-800 shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-40 bg-zinc-800" />
                  <Skeleton className="h-3 w-16 bg-zinc-800" />
                </div>
              </div>
              <Skeleton className="h-9 w-full mt-4 bg-zinc-800 rounded-lg" />
            </div>
          ))}
        </div>
      ) : halls.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <MapPin className="size-10 text-zinc-600" />
          <p className="text-zinc-400 text-sm">No exam halls configured yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {halls.map((hall) => (
            <div
              key={hall.id}
              className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-5"
            >
              {/* Hall info */}
              <div className="flex items-start gap-3 flex-1">
                <div className="shrink-0 flex size-10 items-center justify-center rounded-lg bg-zinc-800">
                  <Building2 className="size-5 text-zinc-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-zinc-50 leading-snug">
                    {hall.name}
                  </p>
                  <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
                    {hall.code}
                  </p>
                  {hall.description && (
                    <p className="text-xs text-zinc-400 mt-2 leading-relaxed line-clamp-2">
                      {hall.description}
                    </p>
                  )}
                </div>
              </div>

              {/* CTA */}
              <div className="mt-4">
                {hall.navigationNode ? (
                  <Button
                    render={<Link href={`/navigate/${hall.id}`} />}
                    nativeButton={false}
                    className="w-full justify-center bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600"
                  >
                    <Navigation className="size-4 mr-2" />
                    Navigate
                  </Button>
                ) : (
                  <div className="flex items-center justify-center rounded-lg bg-zinc-800/60 h-9 border border-zinc-800">
                    <span className="text-xs text-zinc-600">
                      No route available
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
