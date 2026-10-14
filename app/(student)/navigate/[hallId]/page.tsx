"use client";

import { use, useState, useEffect, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/query-keys";
import { ApiError, apiGet, errorMessage } from "@/lib/fetcher";
import { DynamicMap } from "@/components/map/DynamicMap";
import { ArrowLeft, MapPinOff, Navigation, LocateFixed, ExternalLink, Clock, Footprints, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NavHall {
  id: string;
  name: string;
  code: string;
  description: string | null;
  latitude: number;
  longitude: number;
  isActive: boolean;
}

type LatLng = [number, number];

interface WalkingRoute {
  polyline: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
}

/** The parts of the OSRM route response this page reads. */
interface OsrmResponse {
  code: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: { coordinates: Array<[number, number]> };
  }>;
}

/** Why there is no usable position: permission refused, or no fix yet (timeout / signal lost). */
type GeoProblem = "denied" | "waiting";

/** Ignore GPS jitter smaller than this. */
const MIN_MOVE_METERS = 5;
/** Ask for a new walking route once the student has moved this far from where the last one started. */
const REROUTE_METERS = 40;
/** Typical walking speed, used only when the walking route can't be fetched. */
const WALKING_SPEED_MPS = 1.25;

/** Great-circle distance in metres. */
function haversineMeters([lat1, lng1]: LatLng, [lat2, lng2]: LatLng): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function formatDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${m >= 100 ? Math.round(m / 10) * 10 : Math.round(m)} m`;
}

function formatWalk(secs: number): string {
  const mins = Math.max(1, Math.round(secs / 60));
  return mins < 60 ? `${mins} min walk` : `${Math.floor(mins / 60)} h ${mins % 60} min walk`;
}

/** Walking directions from OpenStreetMap's walking-route service (OSRM, foot profile). */
async function fetchWalkingRoute(from: LatLng, to: LatLng): Promise<WalkingRoute> {
  const url =
    `https://routing.openstreetmap.de/routed-foot/route/v1/driving/` +
    `${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error("Walking route service unavailable");
  const json = (await res.json()) as OsrmResponse;
  const route = json.routes?.[0];
  if (json.code !== "Ok" || !route) throw new Error("No walking route found");
  return {
    // OSRM returns [lng, lat] — flip to Leaflet's [lat, lng]
    polyline: route.geometry.coordinates.map(([lng, lat]): LatLng => [lat, lng]),
    distanceMeters: route.distance,
    durationSeconds: route.duration,
  };
}

const subscribeNothing = () => () => {};
const readGeoSupport = () => "geolocation" in navigator;
// Assume support while rendering on the server; the browser corrects it after hydration.
const readServerGeoSupport = () => true;

export default function NavigatePage({
  params,
}: {
  params: Promise<{ hallId: string }>;
}) {
  const { hallId } = use(params);

  const geoSupported = useSyncExternalStore(subscribeNothing, readGeoSupport, readServerGeoSupport);
  const [userPosition, setUserPosition] = useState<LatLng | null>(null);
  const [routeOrigin, setRouteOrigin] = useState<LatLng | null>(null);
  const [geoProblem, setGeoProblem] = useState<GeoProblem | null>(null);

  // The hall itself — returned even if it was deactivated after the timetable was published.
  const hallQuery = useQuery({
    queryKey: QUERY_KEYS.NAV_HALL(hallId),
    queryFn: () => apiGet<NavHall>(`/api/navigation/halls/${encodeURIComponent(hallId)}`),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });
  const hall = hallQuery.data;

  useEffect(() => {
    if (!geoSupported) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const next: LatLng = [pos.coords.latitude, pos.coords.longitude];
        // A successful fix clears any earlier timeout / signal problem.
        setGeoProblem(null);
        setUserPosition((prev) =>
          prev && haversineMeters(prev, next) < MIN_MOVE_METERS ? prev : next
        );
        setRouteOrigin((prev) =>
          prev && haversineMeters(prev, next) < REROUTE_METERS ? prev : next
        );
      },
      (err) => {
        // 1 = permission denied. 2 (position unavailable) and 3 (timeout) are usually a weak
        // GPS signal indoors — keep watching; the next fix clears the message.
        setGeoProblem(err.code === err.PERMISSION_DENIED ? "denied" : "waiting");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [geoSupported]);

  const hallPosition = useMemo<LatLng | null>(
    () => (hall ? [hall.latitude, hall.longitude] : null),
    [hall]
  );

  const routeQuery = useQuery({
    queryKey: ["walking-route", hallId, routeOrigin],
    queryFn: () => fetchWalkingRoute(routeOrigin!, hallPosition!),
    enabled: !!routeOrigin && !!hallPosition,
    // Keep showing the previous route to this hall while the next one (after moving) loads.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === hallId ? previous : undefined,
    staleTime: Infinity,
    retry: 1,
  });
  const route = routeQuery.data;

  // Fallback while the walking route loads or if it can't be fetched. Memoised so the map
  // only re-fits when the student actually moves.
  const straightLine = useMemo<LatLng[] | undefined>(
    () => (userPosition && hallPosition ? [userPosition, hallPosition] : undefined),
    [userPosition, hallPosition]
  );
  const straightDistance = useMemo(
    () => (userPosition && hallPosition ? haversineMeters(userPosition, hallPosition) : null),
    [userPosition, hallPosition]
  );

  const hallMarkers = useMemo(
    () => (hall ? [{ id: hall.id, name: hall.name, lat: hall.latitude, lng: hall.longitude }] : []),
    [hall]
  );

  if (hallQuery.isPending) {
    return (
      <div className="fixed inset-0 z-[40] bg-card flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-12 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Loading map…</p>
        </div>
      </div>
    );
  }

  if (hallQuery.isError || !hall || !hallPosition) {
    const notFound = hallQuery.error instanceof ApiError && hallQuery.error.status === 404;
    return (
      <div className="fixed inset-0 z-[40] bg-background flex flex-col items-center justify-center gap-4 px-6 text-center">
        <MapPinOff className="size-12 text-muted-foreground/70" />
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {notFound ? "Hall not found." : "Couldn't load this hall."}
          </p>
          {!notFound && hallQuery.isError && (
            <p className="text-xs text-muted-foreground/80">{errorMessage(hallQuery.error)}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {!notFound && (
            <Button variant="outline" size="sm" onClick={() => hallQuery.refetch()}>
              Try again
            </Button>
          )}
          <Button render={<Link href="/navigate" />} nativeButton={false} variant="outline" size="sm">
            <ArrowLeft className="size-4 mr-1.5" />
            Back to halls
          </Button>
        </div>
      </div>
    );
  }

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${hall.latitude},${hall.longitude}&travelmode=walking`;

  // ── Status line ────────────────────────────────────────────────────────────
  const denied = geoProblem === "denied";
  const calculating = !!userPosition && !denied && routeQuery.isLoading;
  let status: string;
  if (!geoSupported) status = "GPS not available on this device";
  else if (denied) status = "Location access denied";
  else if (userPosition) status = "Location detected";
  else if (geoProblem === "waiting") status = "Waiting for GPS signal…";
  else status = "Detecting your location…";
  const busy = geoSupported && !denied && !userPosition;

  const showRoute = !!userPosition && !denied && !!route;
  const showStraightLine =
    !!userPosition && !denied && !route && routeQuery.isError && straightDistance != null;

  return (
    <>
      {/* Full-screen map */}
      <div className="fixed inset-0 z-[40]">
        <DynamicMap
          center={userPosition ?? hallPosition}
          zoom={16}
          halls={hallMarkers}
          polyline={route?.polyline ?? straightLine}
          destinationHallId={hall.id}
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
          aria-label="Back to halls"
          className="pointer-events-auto shrink-0 h-10 w-10 p-0 bg-card/90 backdrop-blur-md border-border text-foreground hover:bg-muted shadow-lg"
        >
          <ArrowLeft className="size-4" />
        </Button>

        <div className="pointer-events-auto flex-1 bg-card/90 backdrop-blur-md border border-border/60 rounded-xl px-4 py-2.5 shadow-lg">
          <p className="text-[10px] uppercase tracking-widest text-brand font-medium">Destination</p>
          <p className="text-sm font-semibold text-foreground leading-snug">{hall.name}</p>
          <p className="text-xs text-muted-foreground font-mono">{hall.code}</p>
        </div>
      </div>

      {/* Bottom sheet */}
      <div className="fixed bottom-[4.5rem] md:bottom-0 left-0 right-0 z-[60]">
        <div className="bg-card/95 backdrop-blur-md border-t border-border/80 rounded-t-2xl md:rounded-none px-4 pt-3 pb-4 shadow-2xl space-y-3">
          <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-border md:hidden" />

          {/* Location status */}
          <div className="flex items-center gap-2" role="status" aria-live="polite">
            <LocateFixed
              className={`size-4 shrink-0 ${userPosition && !denied ? "text-brand" : "text-muted-foreground"}`}
            />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{status}</p>
            {busy && (
              <div className="size-3 rounded-full border border-muted-foreground border-t-transparent animate-spin ml-auto" />
            )}
          </div>

          {/* Walking route */}
          {calculating && (
            <div className="flex items-center gap-2.5 rounded-xl bg-muted/40 px-4 py-3">
              <Navigation className="size-5 text-brand animate-pulse shrink-0" />
              <p className="text-sm text-muted-foreground">Calculating walking route…</p>
            </div>
          )}

          {showRoute && route && (
            <div className="flex items-center gap-3 rounded-xl bg-brand/10 border border-brand/20 px-4 py-3">
              <div className="size-9 rounded-full bg-brand/20 flex items-center justify-center shrink-0">
                <Footprints className="size-4 text-brand" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {formatDistance(route.distanceMeters)} · {formatWalk(route.durationSeconds)}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Clock className="size-3 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Walking route</p>
                </div>
              </div>
              <p className="text-xs font-mono text-muted-foreground shrink-0">{hall.code}</p>
            </div>
          )}

          {showStraightLine && straightDistance != null && (
            <div className="flex items-center gap-3 rounded-xl bg-muted/40 border border-border px-4 py-3">
              <div className="size-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Ruler className="size-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{formatDistance(straightDistance)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Straight-line distance · approx. {formatWalk(straightDistance / WALKING_SPEED_MPS)}
                </p>
              </div>
              <p className="text-xs font-mono text-muted-foreground shrink-0">{hall.code}</p>
            </div>
          )}

          {(denied || !geoSupported) && (
            <div className="flex items-center gap-2.5 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3">
              <MapPinOff className="size-5 text-destructive shrink-0" />
              <p className="text-sm text-muted-foreground">
                {denied
                  ? "Allow location access in your browser settings to get directions."
                  : "Use Open in Google Maps below for directions."}
              </p>
            </div>
          )}

          {/* Hand-off to Google Maps walking directions */}
          <Button
            render={<a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" />}
            nativeButton={false}
            variant="outline"
            className="w-full gap-2"
          >
            <ExternalLink className="size-4" />
            Open in Google Maps
          </Button>
        </div>
      </div>
    </>
  );
}
