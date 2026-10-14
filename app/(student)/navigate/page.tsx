"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Navigation } from "lucide-react";
import { QUERY_KEYS } from "@/lib/query-keys";
import { apiGet, errorMessage } from "@/lib/fetcher";
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

const TILE_ZOOM = 17;
/** Thumbnail width ÷ height — keep in step with the `aspect-[2/1]` class below. */
const THUMB_ASPECT = 2;

/** The OSM tile containing a point, and where the point lies inside it (0–1 from the tile's left/top edge). */
function tileFor(lat: number, lng: number) {
  const scale = 2 ** TILE_ZOOM;
  const latRad = (lat * Math.PI) / 180;
  const x = ((lng + 180) / 360) * scale;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale;
  const tileX = Math.floor(x);
  const tileY = Math.floor(y);
  return {
    url: `https://tile.openstreetmap.org/${TILE_ZOOM}/${tileX}/${tileY}.png`,
    fx: x - tileX,
    fy: y - tileY,
  };
}

/**
 * The square tile fills the thumbnail's width, so only part of its height is visible.
 * Slide the visible band to keep the hall as central as possible (object-position),
 * and return where the hall — and so the pin's tip — lands, as percentages.
 */
function thumbnailLayout(fx: number, fy: number) {
  const hidden = THUMB_ASPECT - 1; // tile height that doesn't fit, in thumbnail heights
  const shift = Math.min(1, Math.max(0, (fy * THUMB_ASPECT - 0.5) / hidden));
  return {
    objectPosition: `50% ${shift * 100}%`,
    left: `${fx * 100}%`,
    top: `${(fy * THUMB_ASPECT - hidden * shift) * 100}%`,
  };
}

/** Deterministic colour from hall code — gives each hall a unique accent while its map loads */
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

function HallThumbnail({ hall }: { hall: NavHall }) {
  const tile = tileFor(hall.latitude, hall.longitude);
  const layout = thumbnailLayout(tile.fx, tile.fy);

  return (
    <div className={`relative aspect-[2/1] bg-gradient-to-br ${hallAccentColor(hall.code)} overflow-hidden`}>
      {/* OSM tile image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={tile.url}
        alt={`Map showing ${hall.name}`}
        className="absolute inset-0 w-full h-full object-cover dark:opacity-80"
        style={{ objectPosition: layout.objectPosition }}
        loading="lazy"
      />
      {/* Hall code */}
      <span className="absolute left-2 top-2 bg-card/95 text-foreground font-bold text-xs px-2 py-0.5 rounded-full shadow-md border border-border/60">
        {hall.code}
      </span>
      {/* Pin — its tip marks the hall's position */}
      <MapPin
        aria-hidden="true"
        className="absolute size-7 -translate-x-1/2 -translate-y-full text-brand drop-shadow-md fill-brand/50"
        style={{ left: layout.left, top: layout.top }}
      />
      {/* Map data credit */}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-0 right-0 rounded-tl-md bg-card/85 px-1.5 py-0.5 text-[10px] leading-tight text-muted-foreground hover:text-foreground"
      >
        © OpenStreetMap
      </a>
    </div>
  );
}

export default function NavigateIndexPage() {
  const { data: halls = [], isPending, isError, error, refetch } = useQuery({
    queryKey: QUERY_KEYS.NAV_HALLS,
    queryFn: () => apiGet<NavHall[]>("/api/navigation/halls"),
  });

  return (
    <div className="min-h-screen bg-background px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Navigate</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Select an exam hall to get directions
        </p>
      </div>

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
              <Skeleton className="aspect-[2/1] w-full rounded-none" />
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
          <p className="text-xs text-muted-foreground mt-1">{errorMessage(error)}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            Try again
          </Button>
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
              <HallThumbnail hall={hall} />

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
