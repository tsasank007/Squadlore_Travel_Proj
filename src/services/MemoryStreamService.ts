import { LocationService } from "./LocationService";
import { MediaService } from "./MediaService";

export interface MemoryBubble {
  lat: number;
  lng: number;
  timestamp: string;
  mediaIds: string[];
}

export interface MemoryStream {
  tripId: string;
  route: { lat: number; lng: number; timestamp: string }[];
  bubbles: MemoryBubble[];
}

const BUBBLE_RADIUS_METERS = 150; // photos within this distance + a time window
const BUBBLE_TIME_WINDOW_MINUTES = 20; // get clustered into the same bubble

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export class MemoryStreamService {
  private locationService = new LocationService();
  private mediaService = new MediaService();

  // Deliberately built as plain functions we own, not a database
  // trigger or Supabase Edge Function - this clustering logic is
  // the actual product differentiator and should stay in code we
  // can iterate on freely and test.

  async generate(tripId: string): Promise<MemoryStream> {
    const rawRoute = await this.locationService.getRouteForTrip(tripId);
    const media = await this.mediaService.getMediaForTrip(tripId);

    const route = (rawRoute ?? []).map((p: any) => ({
      lat: p.lat,
      lng: p.lng,
      timestamp: p.captured_at,
    }));

    const bubbles: MemoryBubble[] = [];

    for (const item of media) {
      // Prefer the photo's own captured location (set automatically when
      // the photo was taken) over guessing from the nearest route point
      // by time - this is what actually fixes photos not appearing where
      // they were really taken.
      const itemPoint =
        item.lat != null && item.lng != null
          ? { lat: item.lat, lng: item.lng, timestamp: item.captured_at }
          : this.nearestRoutePoint(route, item.captured_at);
      if (!itemPoint) continue;

      const existing = bubbles.find(
        (b) =>
          haversineMeters(b, itemPoint) < BUBBLE_RADIUS_METERS &&
          Math.abs(
            new Date(b.timestamp).getTime() - new Date(item.captured_at).getTime()
          ) <
            BUBBLE_TIME_WINDOW_MINUTES * 60 * 1000
      );

      if (existing) {
        existing.mediaIds.push(item.id);
      } else {
        bubbles.push({
          lat: itemPoint.lat,
          lng: itemPoint.lng,
          timestamp: item.captured_at,
          mediaIds: [item.id],
        });
      }
    }

    return { tripId, route, bubbles };
  }

  private nearestRoutePoint(
    route: { lat: number; lng: number; timestamp: string }[],
    targetTime: string
  ) {
    if (route.length === 0) return null;
    const target = new Date(targetTime).getTime();
    let closest = route[0];
    let closestDiff = Math.abs(new Date(closest.timestamp).getTime() - target);

    for (const point of route) {
      const diff = Math.abs(new Date(point.timestamp).getTime() - target);
      if (diff < closestDiff) {
        closest = point;
        closestDiff = diff;
      }
    }
    return closest;
  }
}
