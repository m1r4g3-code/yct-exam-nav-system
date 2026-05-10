"use client";

import { useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";

// Fix Leaflet marker icons broken by webpack
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Custom pin icon for the destination hall
const destinationIcon = L.divIcon({
  className: "",
  html: `<div style="
    width: 36px; height: 36px;
    background: #6366f1;
    border: 3px solid white;
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    box-shadow: 0 4px 12px rgba(99,102,241,0.5);
  "></div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -38],
});

// Fits map bounds to show the entire route when polyline changes
function MapBoundsFitter({ polyline }: { polyline: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (polyline.length >= 2) {
      const bounds = L.latLngBounds(polyline);
      map.fitBounds(bounds, { padding: [100, 60], maxZoom: 18 });
    }
  }, [map, polyline]);
  return null;
}

export interface MapViewProps {
  center: [number, number];
  zoom?: number;
  halls: Array<{ id: string; name: string; lat: number; lng: number }>;
  polyline?: number[][];
  destinationHallId?: string;
}

export function MapView({ center, zoom = 17, halls, polyline, destinationHallId }: MapViewProps) {
  const typedPolyline = polyline as [number, number][] | undefined;

  return (
    <MapContainer center={center} zoom={zoom} className="h-full w-full" scrollWheelZoom zoomControl={false}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      {halls.map((hall) => (
        <Marker
          key={hall.id}
          position={[hall.lat, hall.lng]}
          icon={hall.id === destinationHallId ? destinationIcon : new L.Icon.Default()}
        >
          <Popup>
            <span className={hall.id === destinationHallId ? "font-semibold" : undefined}>
              {hall.name}
            </span>
          </Popup>
        </Marker>
      ))}
      {typedPolyline && typedPolyline.length > 0 && (
        <>
          <Polyline
            positions={typedPolyline}
            pathOptions={{ color: "#6366f1", weight: 5, lineCap: "round", lineJoin: "round" }}
          />
          <MapBoundsFitter polyline={typedPolyline} />
        </>
      )}
    </MapContainer>
  );
}
