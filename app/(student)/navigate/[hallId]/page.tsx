"use client";

import { use, useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/query-keys";
import { DynamicMap } from "@/components/map/DynamicMap";
import { ArrowLeft, MapPinOff, Navigation, Footprints, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NavHall {
  id: string;
  name: string;
  code: string;
  latitude: number;
  longitude: number;
  navigationNode: { id: string } | null;
}

interface NavNode {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  nodeType: string;
  examHallId: string | null;
}

interface PathResult {
  nodeIds: string[];
  polylines: number[][];
  totalDistance: number;
}

type LocationState = "detecting" | "detected" | "error" | "unavailable";

function findNearestNode(lat: number, lng: number, nodes: NavNode[], excludeId: string | null): NavNode | null {
  let nearest: NavNode | null = null;
  let minDist = Infinity;
  for (const node of nodes) {
    if (node.id === excludeId) continue;
    const dist = Math.hypot(node.latitude - lat, node.longitude - lng);
    if (dist < minDist) {
      minDist = dist;
      nearest = node;
    }
  }
  return nearest;
}

export default function NavigatePage({
  params,
}: {
  params: Promise<{ hallId: string }>;
}) {
  const { hallId } = use(params);

  // geoUnavailable is derived once at init — avoids setState in effect body
  const [geoUnavailable] = useState(() =>
    typeof navigator !== "undefined" && !navigator.geolocation
  );
  const [geoError, setGeoError] = useState(false);
  const [userPosition, setUserPosition] = useState<[number, number] | null>(null);

  const { data: halls = [], isLoading: hallsLoading } = useQuery<NavHall[]>({
    queryKey: QUERY_KEYS.NAV_HALLS,
    queryFn: async () => {
      const res = await fetch("/api/navigation/halls");
      const json = await res.json();
      return json.data ?? [];
    },
  });

  const { data: nodes = [], isLoading: nodesLoading } = useQuery<NavNode[]>({
    queryKey: QUERY_KEYS.NAV_NODES,
    queryFn: async () => {
      const res = await fetch("/api/navigation/nodes");
      const json = await res.json();
      return json.data ?? [];
    },
  });

  const targetHall = halls.find((h) => h.id === hallId);

  const hallNodeId =
    targetHall?.navigationNode?.id ??
    nodes.find((n) => n.examHallId === hallId)?.id ??
    null;

  // Start watching device location
  useEffect(() => {
    if (geoUnavailable) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setUserPosition([pos.coords.latitude, pos.coords.longitude]),
      () => setGeoError(true),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [geoUnavailable]);

  // Derive nearest start node from live position + loaded nodes
  const nearestNode = useMemo(() => {
    if (!userPosition || nodes.length === 0) return null;
    return findNearestNode(userPosition[0], userPosition[1], nodes, hallNodeId);
  }, [userPosition, nodes, hallNodeId]);

  // Derive display state — no setState needed
  const locationState: LocationState = geoUnavailable
    ? "unavailable"
    : geoError
    ? "error"
    : nearestNode
    ? "detected"
    : "detecting";

  const { data: pathResult, isLoading: pathLoading } = useQuery<PathResult>({
    queryKey: QUERY_KEYS.NAV_PATH(nearestNode?.id ?? "", hallNodeId ?? ""),
    queryFn: async () => {
      const res = await fetch(
        `/api/navigation/path?from=${encodeURIComponent(nearestNode!.id)}&to=${encodeURIComponent(hallNodeId!)}`
      );
      const json = await res.json();
      return json.data;
    },
    enabled: !!nearestNode?.id && !!hallNodeId,
  });

  const isLoading = hallsLoading || nodesLoading;

  const mapCenter: [number, number] = userPosition ?? (targetHall
    ? [targetHall.latitude, targetHall.longitude]
    : [6.516, 3.39]);

  const hallMarkers = targetHall
    ? [{ id: targetHall.id, name: targetHall.name, lat: targetHall.latitude, lng: targetHall.longitude }]
    : [];

  // ─── Loading skeleton ───────────────────────────────────────────────
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

  // ─── Hall not found ─────────────────────────────────────────────────
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

  // ─── No navigation node for this hall ───────────────────────────────
  if (!hallNodeId) {
    return (
      <div className="fixed inset-0 z-[40] bg-background flex flex-col items-center justify-center gap-4 px-6">
        <MapPinOff className="size-12 text-muted-foreground/70" />
        <div className="text-center">
          <p className="text-foreground font-semibold">{targetHall.name}</p>
          <p className="text-muted-foreground text-sm mt-1">Navigation is not yet configured for this hall.</p>
        </div>
        <Button render={<Link href="/navigate" />} nativeButton={false} variant="outline" size="sm">
          <ArrowLeft className="size-4 mr-1.5" />
          Back to halls
        </Button>
      </div>
    );
  }

  // ─── Main map view ───────────────────────────────────────────────────
  return (
    <>
      {/* Full-screen map layer */}
      <div className="fixed inset-0 z-[40]">
        <DynamicMap
          center={mapCenter}
          zoom={17}
          halls={hallMarkers}
          polyline={pathResult?.polylines}
          destinationHallId={hallId}
          userLocation={userPosition ?? undefined}
        />
      </div>

      {/* Top overlay — back + destination info */}
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

      {/* Bottom sheet — location status + route info */}
      <div className="fixed bottom-[4.5rem] md:bottom-0 left-0 right-0 z-[60]">
        <div className="bg-card/95 backdrop-blur-md border-t border-border/80 rounded-t-2xl md:rounded-none px-4 pt-3 pb-4 shadow-2xl">
          {/* Drag handle (mobile) */}
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border md:hidden" />

          {/* Live location status */}
          <div className="flex items-center gap-2 mb-3">
            <LocateFixed className={`size-4 shrink-0 ${locationState === "detected" ? "text-brand" : "text-muted-foreground"}`} />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {locationState === "detecting" && "Detecting your location…"}
              {locationState === "detected" && `Near: ${nearestNode?.label ?? "Unknown"}`}
              {locationState === "error" && "Location access denied"}
              {locationState === "unavailable" && "GPS not available on this device"}
            </p>
            {locationState === "detecting" && (
              <div className="size-3 rounded-full border border-muted-foreground border-t-transparent animate-spin ml-auto" />
            )}
          </div>

          {/* Route info */}
          {locationState === "detected" && nearestNode && pathLoading && (
            <div className="flex items-center gap-2.5 rounded-xl bg-muted/40 px-4 py-3">
              <Navigation className="size-5 text-brand animate-pulse shrink-0" />
              <p className="text-sm text-muted-foreground">Calculating route…</p>
            </div>
          )}

          {locationState === "detected" && pathResult && !pathLoading && (
            <div className="flex items-center gap-3 rounded-xl bg-brand/10 border border-brand/20 px-4 py-3">
              <div className="size-9 rounded-full bg-brand/20 flex items-center justify-center shrink-0">
                <Footprints className="size-4 text-brand" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{pathResult.totalDistance}m</p>
                <p className="text-xs text-muted-foreground">estimated walking distance</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-mono text-muted-foreground">{targetHall.code}</p>
              </div>
            </div>
          )}

          {locationState === "detected" && nearestNode && !pathLoading && !pathResult && (
            <div className="flex items-center gap-2.5 rounded-xl bg-muted/40 px-4 py-3">
              <MapPinOff className="size-5 text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground">No route found from your location.</p>
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
        </div>
      </div>
    </>
  );
}
