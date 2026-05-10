"use client";

import dynamic from "next/dynamic";
import type { MapViewProps } from "./MapView";

const MapViewDynamic = dynamic(
  () => import("./MapView").then((m) => ({ default: m.MapView })),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full bg-zinc-900 animate-pulse rounded-lg flex items-center justify-center">
        <span className="text-zinc-600 text-sm">Loading map...</span>
      </div>
    ),
  }
);

export type { MapViewProps };
export { MapViewDynamic as DynamicMap };
