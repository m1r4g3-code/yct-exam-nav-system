"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Navigation } from "lucide-react";
import { QUERY_KEYS } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface NavHall {
  id: string;
  name: string;
  code: string;
  description: string | null;
  latitude: number;
  longitude: number;
}

/** Converts lat/lng to OSM tile x/y at a given zoom level */
function latLngToTile(lat: number, lng: number, zoom: number) {
  const x = Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  );
  return { x, y };
}

/** Returns a URL to a single OSM raster tile that contains the hall location */
function hallTileUrl(lat: number, lng: number): string {
  const zoom = 17;
  const { x, y } = latLngToTile(lat, lng, zoom);
  return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
}

/** Deterministic colour from hall code — gives each hall a unique accent */
function hallAccentColor(code: string): string {
  const colors = [
    "from-blue-900/60 to-blue-800/40",
    "from-emerald-900/60 to-emerald-800/40",
    "from-violet-900/60 to-violet-800/40",
    "from-amber-900/60 to-amber-800/40",
    "from-rose-900/60 to-rose-800/40",
    "from-cyan-900/60 to-cyan-800/40",
  ];
  let hash = 0;
  for (let i = 0; i < code.length; i++) hash = (hash * 31 + code.charCodeAt(i)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

export default function NavigateIndexPage() {
  const { data: halls = [], isLoading, isError } = useQuery<NavHall[]>({
    queryKey: QUERY_KEYS.NAV_HALLS,
    queryFn: async () => {
      const res = await fetch("/api/navigation/halls");
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      return json.data ?? [];
    },
  });

  return (
    <div className="min-h-screen bg-background px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Navigate</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Select an exam hall to get directions
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
              <Skeleton className="h-36 w-full" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-9 w-full mt-3 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-8 text-center">
          <p className="text-sm font-medium text-destructive">Failed to load halls</p>
          <p className="text-xs text-muted-foreground mt-1">Check your connection and refresh the page.</p>
        </div>
      ) : halls.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <MapPin className="size-10 text-muted-foreground/70" />
          <p className="text-muted-foreground text-sm">No exam halls configured yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {halls.map((hall) => (
            <div
              key={hall.id}
              className="flex flex-col rounded-xl border border-border bg-card overflow-hidden"
            >
              {/* Map thumbnail */}
              <div className={`relative h-36 bg-gradient-to-br ${hallAccentColor(hall.code)} overflow-hidden`}>
                {/* OSM tile image */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={hallTileUrl(hall.latitude, hall.longitude)}
                  alt={`Map showing ${hall.name}`}
                  className="absolute inset-0 w-full h-full object-cover opacity-60"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                {/* Pin overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="bg-card/95 text-foreground font-bold text-xs px-2 py-0.5 rounded-full shadow-md border border-border/60">
                      {hall.code}
                    </div>
                    <MapPin className="size-7 text-brand drop-shadow-md fill-brand/50" />
                  </div>
                </div>
              </div>

              {/* Hall info */}
              <div className="flex flex-col flex-1 p-4">
                <p className="font-semibold text-foreground leading-snug">{hall.name}</p>
                {hall.description && (
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                    {hall.description}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground/70 font-mono mt-1">
                  {hall.latitude.toFixed(5)}, {hall.longitude.toFixed(5)}
                </p>

                {/* CTA */}
                <div className="mt-3">
                  <Button
                    render={<Link href={`/navigate/${hall.id}`} />}
                    nativeButton={false}
                    size="sm"
                  >
                    <Navigation className="size-4 mr-1.5" />
                    Navigate
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
