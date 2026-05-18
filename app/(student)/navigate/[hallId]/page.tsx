"use client";

import { use, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/query-keys";
import { DynamicMap } from "@/components/map/DynamicMap";
import { ArrowLeft, MapPinOff, Navigation, LocateFixed, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NavHall {
  id: string;
  name: string;
  code: string;
  latitude: number;
  longitude: number;
}

type LocationState = "detecting" | "detected" | "error" | "unavailable";

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
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
          if (d < 0.00005) return;
        }
        lastPosRef.current = next;
        setUserPosition(next);
      },
      () => setGeoError(true),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [geoUnavailable]);

  const locationState: LocationState = geoUnavailable
    ? "unavailable"
    : geoError
    ? "error"
    : userPosition
    ? "detected"
    : "detecting";

  const distanceMeters =
    userPosition && targetHall
      ? haversineMeters(userPosition[0], userPosition[1], targetHall.latitude, targetHall.longitude)
      : null;

  const googleMapsUrl = targetHall
    ? `https://www.google.com/maps/dir/?api=1&destination=${targetHall.latitude},${targetHall.longitude}&travelmode=walking`
    : "#";

  const mapCenter: [number, number] = userPosition ??
    (targetHall ? [targetHall.latitude, targetHall.longitude] : [6.5158, 3.378]);

  const hallMarkers = targetHall
    ? [{ id: targetHall.id, name: targetHall.name, lat: targetHall.latitude, lng: targetHall.longitude }]
    : [];

  // Straight line from user to hall
  const polyline: number[][] | undefined =
    userPosition && targetHall
      ? [[userPosition[0], userPosition[1]], [targetHall.latitude, targetHall.longitude]]
      : undefined;

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
          zoom={17}
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

          {/* Distance indicator */}
          {distanceMeters !== null && (
            <div className="flex items-center gap-3 rounded-xl bg-brand/10 border border-brand/20 px-4 py-3">
              <div className="size-9 rounded-full bg-brand/20 flex items-center justify-center shrink-0">
                <Navigation className="size-4 text-brand" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {distanceMeters >= 1000
                    ? `${(distanceMeters / 1000).toFixed(1)} km`
                    : `${distanceMeters} m`} away
                </p>
                <p className="text-xs text-muted-foreground">straight-line distance to hall</p>
              </div>
            </div>
          )}

          {/* Google Maps navigation button */}
          <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="block">
            <Button className="w-full gap-2">
              <ExternalLink className="size-4" />
              Open Walking Directions in Google Maps
            </Button>
          </a>
        </div>
      </div>
    </>
  );
}
