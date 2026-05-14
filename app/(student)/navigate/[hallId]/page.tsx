"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/query-keys";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DynamicMap } from "@/components/map/DynamicMap";
import { ArrowLeft, MapPinOff, Navigation, Footprints } from "lucide-react";
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

// ─── Full-screen map layout — sits behind the student shell's fixed header/tab bar ───

export default function NavigatePage({
  params,
}: {
  params: Promise<{ hallId: string }>;
}) {
  const { hallId } = use(params);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");

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

  const { data: pathResult, isLoading: pathLoading } = useQuery<PathResult>({
    queryKey: QUERY_KEYS.NAV_PATH(selectedNodeId, hallNodeId ?? ""),
    queryFn: async () => {
      const res = await fetch(
        `/api/navigation/path?from=${encodeURIComponent(selectedNodeId)}&to=${encodeURIComponent(hallNodeId!)}`
      );
      const json = await res.json();
      return json.data;
    },
    enabled: !!selectedNodeId && !!hallNodeId,
  });

  const isLoading = hallsLoading || nodesLoading;
  const startNodes = nodes.filter((n) => n.id !== hallNodeId);

  const mapCenter: [number, number] = targetHall
    ? [targetHall.latitude, targetHall.longitude]
    : nodes[0]
    ? [nodes[0].latitude, nodes[0].longitude]
    : [6.516, 3.39];

  const hallMarkers = targetHall
    ? [{ id: targetHall.id, name: targetHall.name, lat: targetHall.latitude, lng: targetHall.longitude }]
    : [];

  // ─── Loading skeleton ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[40] bg-card flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-12 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
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
        />
      </div>

      {/* Top overlay — back + destination info */}
      {/* Mobile: below status bar; Desktop: below the 64px header */}
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
          <p className="text-[10px] uppercase tracking-widest text-indigo-400 font-medium">Destination</p>
          <p className="text-sm font-semibold text-foreground leading-snug">{targetHall.name}</p>
          <p className="text-xs text-muted-foreground font-mono">{targetHall.code}</p>
        </div>
      </div>

      {/* Bottom sheet — starting point + route info */}
      {/* Mobile: sits above the tab bar (bottom-[4.5rem] ≈ 72px); Desktop: at viewport bottom */}
      <div className="fixed bottom-[4.5rem] md:bottom-0 left-0 right-0 z-[60]">
        {/* Gradient fade from transparent to sheet background */}
        <div className="pointer-events-none h-12 bg-gradient-to-t from-card/80 to-transparent" />

        <div className="bg-card/95 backdrop-blur-md border-t border-border/80 rounded-t-2xl md:rounded-none px-4 pt-3 pb-4 shadow-2xl">
          {/* Drag handle (mobile) */}
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border md:hidden" />

          {/* Starting point selector */}
          <div className="space-y-1.5 mb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Starting from</p>
            <Select
              value={selectedNodeId}
              onValueChange={(v) => v != null && setSelectedNodeId(v)}
            >
              <SelectTrigger className="w-full h-11 rounded-xl">
                <SelectValue placeholder="Choose your starting location…" />
              </SelectTrigger>
              <SelectContent side="top" sideOffset={8} className="max-h-52">
                {startNodes.map((node) => (
                  <SelectItem key={node.id} value={node.id}>
                    {node.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Route info */}
          {selectedNodeId && pathLoading && (
            <div className="flex items-center gap-2.5 rounded-xl bg-muted/40 px-4 py-3">
              <Navigation className="size-5 text-indigo-400 animate-pulse shrink-0" />
              <p className="text-sm text-muted-foreground">Calculating route…</p>
            </div>
          )}

          {pathResult && !pathLoading && (
            <div className="flex items-center gap-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-4 py-3">
              <div className="size-9 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
                <Footprints className="size-4 text-indigo-400" />
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

          {selectedNodeId && !pathLoading && !pathResult && (
            <div className="flex items-center gap-2.5 rounded-xl bg-muted/40 px-4 py-3">
              <MapPinOff className="size-5 text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground">No route found between these points.</p>
            </div>
          )}

          {!selectedNodeId && (
            <div className="flex items-center gap-2.5 rounded-xl bg-muted/40 px-4 py-3">
              <Navigation className="size-5 text-muted-foreground/70 shrink-0" />
              <p className="text-sm text-muted-foreground">Select a starting point to calculate your route.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
