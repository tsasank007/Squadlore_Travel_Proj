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
    const { error } = await supabase.from("location_pings").insert({
      trip_id: input.tripId,
      user_id: input.userId,
      geom: `POINT(${input.lng} ${input.lat})`,
      captured_at: input.capturedAt,
      source: input.source ?? "live",
    });

    if (error) throw error;
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
}
