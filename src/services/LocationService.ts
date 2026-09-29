import { supabase } from "../db/supabaseClient";

export interface RecordPingInput {
  tripId: string;
  userId: string;
  lat: number;
  lng: number;
  capturedAt: string; // ISO timestamp from the device, not the server -
                       // critical for store-and-forward batches where
                       // pings arrive late but need their original time.
  source?: "live" | "store_and_forward";
}

export class LocationService {
  // This is the service we expect to eventually lift out into its
  // own Go + Redis service once ping volume becomes the bottleneck
  // (see Phase B of the migration plan). Every route handler should
  // call THIS method, never touch location_pings directly - that's
  // what makes that future extraction possible without touching
  // route handlers or mobile clients.

  async recordPing(input: RecordPingInput) {
    const isOutlier = await this.impliesImpossibleSpeed(input);
    if (isOutlier) {
      // A real GPS glitch (weak signal briefly reports a point km away),
      // not a real jump - storing it would draw a garbage line through it
      // and make two people in the same car look like they took different
      // routes. Drop it silently; the next ping a few seconds later will
      // almost always be fine.
      return;
    }

    const { error } = await supabase.from("location_pings").insert({
      trip_id: input.tripId,
      user_id: input.userId,
      geom: `POINT(${input.lng} ${input.lat})`,
      captured_at: input.capturedAt,
      source: input.source ?? "live",
    });

    if (error) throw error;
  }

  private async impliesImpossibleSpeed(input: RecordPingInput): Promise<boolean> {
    // Uses the same safe pattern as the other route functions: a plain
    // lat/lng RPC, not a raw select on `geom` - PostGIS geometry doesn't
    // reliably serialize to JSON through Supabase's REST layer, which is
    // exactly why those other functions exist.
    const { data, error } = await supabase.rpc("latest_ping_for_user", {
      p_trip_id: input.tripId,
      p_user_id: input.userId,
    });
    const last = data?.[0];
    if (error || !last) return false; // first ping for this user - nothing to compare against

    const seconds = (new Date(input.capturedAt).getTime() - new Date(last.captured_at).getTime()) / 1000;
    if (seconds <= 0) return false; // out-of-order arrival - let it through rather than guess
    const meters = haversineMeters([last.lng, last.lat], [input.lng, input.lat]);
    const impliedKmh = (meters / seconds) * 3.6;
    return impliedKmh > 300; // generous - real driving never reaches this, GPS glitches often do
  }

  async recordBatch(pings: RecordPingInput[]) {
    // Store-and-forward sync: a device that queued pings offline
    // calls this once connectivity returns, rather than one
    // request per ping.
    const rows = pings.map((p) => ({
      trip_id: p.tripId,
      user_id: p.userId,
      geom: `POINT(${p.lng} ${p.lat})`,
      captured_at: p.capturedAt,
      source: p.source ?? "store_and_forward",
    }));

    const { error } = await supabase.from("location_pings").insert(rows);
    if (error) throw error;
  }

  async getRouteForTrip(tripId: string, userId?: string) {
    // Calls the get_route_for_trip() SQL function (see schema.sql),
    // which returns plain lat/lng doubles - keeps geometry parsing
    // in the database rather than adding a PostGIS-parsing dependency
    // to the API layer.
    const { data, error } = await supabase.rpc("get_route_for_trip", {
      p_trip_id: tripId,
    });

    if (error) throw error;
    return userId ? (data ?? []).filter((p: any) => p.user_id === userId) : data;
  }

  async getLatestPositions(tripId: string) {
    // Powers the live map - one point per active member.
    const { data, error } = await supabase.rpc("latest_ping_per_user", {
      p_trip_id: tripId,
    });

    if (error) throw error;
    return data;
  }

  async getRoadRoutePerUser(tripId: string): Promise<Record<string, [number, number][]>> {
    // Build each person's route from EVERYWHERE we know they were: their
    // location pings AND the spots where their photos were taken.
    //
    // Why not "map matching" (what this used to do): that only works with
    // dense, closely-spaced GPS points. A web page can't track location while
    // the screen is locked or the camera is open, so points are sparse, and
    // map matching gives up on sparse points. Routing between the known
    // points along real roads works fine with sparse data - the tradeoff is
    // that between two known points it shows the most likely road route, not
    // a recording of the exact one. (True continuous tracking needs a native app.)
    const raw = await this.getRouteForTrip(tripId);
    const pointsByUser: Record<string, TimedPoint[]> = {};
    (raw ?? []).forEach((p: any) => {
      (pointsByUser[p.user_id] = pointsByUser[p.user_id] || []).push({ lng: p.lng, lat: p.lat, t: new Date(p.captured_at).getTime() });
    });

    const { data: photos, error } = await supabase
      .from("media")
      .select("user_id, lat, lng, captured_at")
      .eq("trip_id", tripId)
      .eq("is_private", false) // a private photo must not leak its location into the shared route
      .not("lat", "is", null);
    if (error) throw error;
    (photos ?? []).forEach((m: any) => {
      (pointsByUser[m.user_id] = pointsByUser[m.user_id] || []).push({ lng: m.lng, lat: m.lat, t: new Date(m.captured_at).getTime() });
    });

    const result: Record<string, [number, number][]> = {};
    for (const userId of Object.keys(pointsByUser)) {
      const ordered = pointsByUser[userId].sort((a, b) => a.t - b.t);
      result[userId] = await routeThroughPoints(ordered.map((p) => [p.lng, p.lat] as [number, number]));
    }
    return result;
  }
}

interface TimedPoint { lng: number; lat: number; t: number }

export function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]), dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Drop points closer than `spacing` metres to the last one we kept (a parked
// phone jitters around, and routing between points 20m apart is just noise) -
// but always keep the final point so the line reaches where they last were.
export function thinPoints(points: [number, number][], spacing: number): [number, number][] {
  if (points.length <= 1) return points.slice();
  const kept: [number, number][] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (haversineMeters(kept[kept.length - 1], points[i]) >= spacing) kept.push(points[i]);
  }
  const last = points[points.length - 1];
  if (kept[kept.length - 1] !== last && haversineMeters(kept[kept.length - 1], last) > 30) kept.push(last);
  return kept;
}

// Finished chunks never change, so they're remembered - polling every few
// seconds costs nothing, and only the newest (still-growing) chunk is re-asked.
const chunkCache = new Map<string, [number, number][]>();
const MAX_CACHED_CHUNKS = 800;
const MAX_WAYPOINTS_PER_REQUEST = 25; // Mapbox Directions limit for driving

async function routeChunk(chunk: [number, number][]): Promise<[number, number][]> {
  const key = chunk.map((c) => `${c[0].toFixed(5)},${c[1].toFixed(5)}`).join(";");
  const cached = chunkCache.get(key);
  if (cached) return cached;

  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${key}?geometries=geojson&overview=full&continue_straight=false&access_token=${process.env.MAPBOX_TOKEN}`;
  try {
    const res = await fetch(url);
    const data: any = await res.json();
    const line = data?.routes?.[0]?.geometry?.coordinates;
    if (data?.code === "Ok" && Array.isArray(line) && line.length >= 2) {
      if (chunkCache.size >= MAX_CACHED_CHUNKS) chunkCache.clear();
      chunkCache.set(key, line);
      return line;
    }
    console.error("Directions gave no route:", data?.code, data?.message);
  } catch (err) {
    console.error("Directions request failed:", err);
  }
  return chunk; // couldn't route this stretch: straight segments, and try again next time
}

export async function routeThroughPoints(points: [number, number][]): Promise<[number, number][]> {
  if (points.length < 2) return points;

  let spacing = 200;
  let waypoints = thinPoints(points, spacing);
  while (waypoints.length > 480 && spacing < 6400) { spacing *= 2; waypoints = thinPoints(points, spacing); }
  if (waypoints.length < 2) return points.length >= 2 ? [points[0], points[points.length - 1]] : points;

  const chunks: [number, number][][] = [];
  for (let i = 0; i < waypoints.length - 1; i += MAX_WAYPOINTS_PER_REQUEST - 1) {
    chunks.push(waypoints.slice(i, i + MAX_WAYPOINTS_PER_REQUEST));
  }
  const lines = await Promise.all(chunks.map(routeChunk));

  const out: [number, number][] = [];
  lines.forEach((line, idx) => {
    // consecutive chunks share a joint point - don't repeat it
    (idx === 0 ? line : line.slice(1)).forEach((c) => out.push(c));
  });
  return out;
}
