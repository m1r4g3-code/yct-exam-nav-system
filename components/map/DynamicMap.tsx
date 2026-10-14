"use client";

import dynamic from "next/dynamic";
import type { MapViewProps } from "./MapView";

const MapViewDynamic = dynamic(
  () => import("./MapView").then((m) => ({ default: m.MapView })),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full bg-muted animate-pulse rounded-lg flex items-center justify-center">
        <span className="text-muted-foreground text-sm">Loading map…</span>
      </div>
    ),
  }
);

export type { MapViewProps };
export { MapViewDynamic as DynamicMap };
