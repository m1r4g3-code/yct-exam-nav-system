"use client";

import { use, useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/query-keys";
import { DynamicMap } from "@/components/map/DynamicMap";
import { ArrowLeft, MapPinOff, Navigation, LocateFixed, ExternalLink, Clock, Footprints } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NavHall {
  id: string;
  name: string;
  code: string;
  latitude: number;
  longitude: number;
}

interface OsrmRoute {
  polyline: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
}

type LocationState = "detecting" | "detected" | "error" | "unavailable";

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

function formatDuration(secs: number): string {
  const mins = Math.ceil(secs / 60);
  return mins < 60 ? `${mins} min walk` : `${Math.floor(mins / 60)}h ${mins % 60}min walk`;
}

export default function NavigatePage({
  params,
}: {
  params: Promise<{ hallId: string }>;
}) {
  const { hallId } = use(params);

  const [geoUnavailable] = useState(
    () => typeof navigator !== "undefined" && !navigator.geolocation
  );
  const [geoError, setGeoError] = useState(false);
  const [userPosition, setUserPosition] = useState<[number, number] | null>(null);
  const lastPosRef = useRef<[number, number] | null>(null);

  const { data: halls = [], isLoading } = useQuery<NavHall[]>({
    queryKey: QUERY_KEYS.NAV_HALLS,
    queryFn: async () => {
      const res = await fetch("/api/navigation/halls");
      const json = await res.json();
      return json.data ?? [];
    },
  });

  const targetHall = halls.find((h) => h.id === hallId);

  useEffect(() => {
    if (geoUnavailable) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const next: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        if (lastPosRef.current) {
          const d = Math.hypot(next[0] - lastPosRef.current[0], next[1] - lastPosRef.current[1]);
          if (d < 0.00005) return; // skip if <~5m
        }
        lastPosRef.current = next;
        setUserPosition(next);
      },
      () => setGeoError(true),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [geoUnavailable]);

  // Round to 3 decimal places (~100m) so OSRM only re-routes on significant movement
  const routeKey = useMemo(
    () => userPosition
      ? [Math.round(userPosition[0] * 1000) / 1000, Math.round(userPosition[1] * 1000) / 1000]
      : null,
    [userPosition]
  );

  const { data: route, isLoading: routeLoading, isError: routeError } = useQuery<OsrmRoute | null>({
    queryKey: ["osrm-route", routeKey, targetHall?.id],
    queryFn: async (): Promise<OsrmRoute | null> => {
      if (!userPosition || !targetHall) return null;
      const [uLat, uLng] = userPosition;
      const url =
        `https://router.project-osrm.org/route/v1/foot/` +
        `${uLng},${uLat};${targetHall.longitude},${targetHall.latitude}` +
        `?geometries=geojson&overview=full`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error("OSRM unavailable");
      const json = await res.json();
      if (json.code !== "Ok" || !json.routes?.length) throw new Error("No route");
      const r = json.routes[0];
      return {
        // OSRM returns [lng, lat] — flip to Leaflet [lat, lng]
        polyline: r.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]),
        distanceMeters: Math.round(r.distance),
        durationSeconds: Math.round(r.duration),
      };
    },
    enabled: !!routeKey && !!targetHall,
    retry: 2,
    staleTime: 60 * 1000,
  });

  const locationState: LocationState = geoUnavailable
    ? "unavailable"
    : geoError
    ? "error"
    : userPosition
    ? "detected"
    : "detecting";

  const googleMapsUrl = targetHall
    ? `https://www.google.com/maps/dir/?api=1&destination=${targetHall.latitude},${targetHall.longitude}&travelmode=walking`
    : "#";

  const mapCenter: [number, number] = userPosition ??
    (targetHall ? [targetHall.latitude, targetHall.longitude] : [6.5158, 3.378]);

  const hallMarkers = targetHall
    ? [{ id: targetHall.id, name: targetHall.name, lat: targetHall.latitude, lng: targetHall.longitude }]
    : [];

  // Use OSRM polyline if available, straight line as fallback while loading
  const polyline: number[][] | undefined =
    route?.polyline ??
    (userPosition && targetHall
      ? [[userPosition[0], userPosition[1]], [targetHall.latitude, targetHall.longitude]]
      : undefined);

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[40] bg-card flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-12 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Loading map…</p>
        </div>
      </div>
    );
  }

  if (!targetHall) {
    return (
      <div className="fixed inset-0 z-[40] bg-background flex flex-col items-center justify-center gap-4">
        <MapPinOff className="size-12 text-muted-foreground/70" />
        <p className="text-muted-foreground text-sm">Hall not found.</p>
        <Button render={<Link href="/navigate" />} nativeButton={false} variant="outline" size="sm">
          <ArrowLeft className="size-4 mr-1.5" />
          Back to halls
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* Full-screen map */}
      <div className="fixed inset-0 z-[40]">
        <DynamicMap
          center={mapCenter}
          zoom={16}
          halls={hallMarkers}
          polyline={polyline}
          destinationHallId={hallId}
          userLocation={userPosition ?? undefined}
        />
      </div>

      {/* Top overlay — back + destination */}
      <div className="fixed top-4 md:top-20 left-4 right-4 z-[60] flex items-start gap-2 pointer-events-none">
        <Button
          render={<Link href="/navigate" />}
          nativeButton={false}
          size="sm"
          variant="outline"
          className="pointer-events-auto shrink-0 h-10 w-10 p-0 bg-card/90 backdrop-blur-md border-border text-foreground hover:bg-muted shadow-lg"
        >
          <ArrowLeft className="size-4" />
        </Button>

        <div className="pointer-events-auto flex-1 bg-card/90 backdrop-blur-md border border-border/60 rounded-xl px-4 py-2.5 shadow-lg">
          <p className="text-[10px] uppercase tracking-widest text-brand font-medium">Destination</p>
          <p className="text-sm font-semibold text-foreground leading-snug">{targetHall.name}</p>
          <p className="text-xs text-muted-foreground font-mono">{targetHall.code}</p>
        </div>
      </div>

      {/* Bottom sheet */}
      <div className="fixed bottom-[4.5rem] md:bottom-0 left-0 right-0 z-[60]">
        <div className="bg-card/95 backdrop-blur-md border-t border-border/80 rounded-t-2xl md:rounded-none px-4 pt-3 pb-4 shadow-2xl space-y-3">
          <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-border md:hidden" />

          {/* Location status */}
          <div className="flex items-center gap-2">
            <LocateFixed className={`size-4 shrink-0 ${locationState === "detected" ? "text-brand" : "text-muted-foreground"}`} />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {locationState === "detecting" && "Detecting your location…"}
              {locationState === "detected" && "Location detected"}
              {locationState === "error" && "Location access denied"}
              {locationState === "unavailable" && "GPS not available on this device"}
            </p>
            {locationState === "detecting" && (
              <div className="size-3 rounded-full border border-muted-foreground border-t-transparent animate-spin ml-auto" />
            )}
          </div>

          {/* Route info */}
          {locationState === "detected" && routeLoading && (
            <div className="flex items-center gap-2.5 rounded-xl bg-muted/40 px-4 py-3">
              <Navigation className="size-5 text-brand animate-pulse shrink-0" />
              <p className="text-sm text-muted-foreground">Calculating route…</p>
            </div>
          )}

          {locationState === "detected" && route && !routeLoading && (
            <div className="flex items-center gap-3 rounded-xl bg-brand/10 border border-brand/20 px-4 py-3">
              <div className="size-9 rounded-full bg-brand/20 flex items-center justify-center shrink-0">
                <Footprints className="size-4 text-brand" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {formatDistance(route.distanceMeters)}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Clock className="size-3 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">{formatDuration(route.durationSeconds)}</p>
                </div>
              </div>
              <p className="text-xs font-mono text-muted-foreground shrink-0">{targetHall.code}</p>
            </div>
          )}

          {locationState === "detected" && routeError && !routeLoading && (
            <div className="flex items-center gap-2.5 rounded-xl bg-muted/40 px-4 py-3">
              <Navigation className="size-5 text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground">
                Route unavailable — use Google Maps below for directions.
              </p>
            </div>
          )}

          {(locationState === "error" || locationState === "unavailable") && (
            <div className="flex items-center gap-2.5 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3">
              <MapPinOff className="size-5 text-destructive shrink-0" />
              <p className="text-sm text-muted-foreground">
                {locationState === "error"
                  ? "Allow location access in your browser settings to get directions."
                  : "GPS is not supported on this device."}
              </p>
            </div>
          )}

          {/* Google Maps fallback button */}
          <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="block">
            <Button variant="outline" className="w-full gap-2">
              <ExternalLink className="size-4" />
              Open in Google Maps
            </Button>
          </a>
        </div>
      </div>
    </>
  );
}
