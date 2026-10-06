import { supabase } from "../db/supabaseClient";

export interface StartTripInput {
  packId: string;
  name: string;
  discussionLocation?: string;
}

// If the trip_participants table hasn't been created yet, every lookup below
// fails. That must NEVER break the rest of the app (trip lists, live maps,
// uploads) - so a failed lookup just means "nobody has ended their trip yet",
// and the problem is logged once so it can be found in `pm2 logs`.
let warnedParticipants = false;
function participantsUnavailable(error: unknown) {
  if (warnedParticipants) return;
  warnedParticipants = true;
  console.error("trip_participants lookup failed - treating everyone as still on their trip. Has the SQL for this feature been run?", error);
}

export async function leftUserIds(tripId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from("trip_participants").select("user_id").eq("trip_id", tripId);
  if (error) { participantsUnavailable(error); return new Set(); }
  return new Set((data ?? []).map((r: any) => r.user_id));
}

export class TripService {
  async startTrip(input: StartTripInput) {
    const { data, error } = await supabase
      .from("trips")
      .insert({
        pack_id: input.packId,
        name: input.name,
        discussion_location: input.discussionLocation,
        status: "active",
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async endTrip(tripId: string) {
    const { data, error } = await supabase
      .from("trips")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", tripId)
      .select()
      .single();

    if (error) throw error;

    // Memory Stream generation is deliberately NOT inlined here.
    // Keep it as its own service (MemoryStreamService) so the
    // route-building logic - our real product IP - lives in code
    // we own, not in a database trigger or platform-specific function.
    return data;
  }

  // Undo an ended trip (e.g. someone tapped End by accident). Ending only ever
  // changed these two fields - no photos, locations or members are touched - so
  // putting them back restores the trip exactly.
  async resumeTrip(tripId: string) {
    const { data, error } = await supabase
      .from("trips")
      .update({ status: "active", ended_at: null })
      .eq("id", tripId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // "End MY trip": only this person's part ends. The trip stays active for
  // everyone else, and they can still view it (and everyone's photos) forever.
  async leaveTrip(tripId: string, userId: string) {
    const { error } = await supabase
      .from("trip_participants")
      .upsert({ trip_id: tripId, user_id: userId, left_at: new Date().toISOString() }, { onConflict: "trip_id,user_id" });
    if (error) throw error;
  }

  async rejoinTrip(tripId: string, userId: string) {
    const { error } = await supabase.from("trip_participants").delete().eq("trip_id", tripId).eq("user_id", userId);
    if (error) throw error;
  }

  async hasLeft(tripId: string, userId?: string): Promise<boolean> {
    if (!userId) return false;
    const { data, error } = await supabase
      .from("trip_participants").select("user_id").eq("trip_id", tripId).eq("user_id", userId).maybeSingle();
    if (error) { participantsUnavailable(error); return false; }
    return !!data;
  }

  // When a userId is given, each trip is marked `left: true` if that person
  // has ended their own part of it.
  async listTripsForPack(packId: string, userId?: string) {
    const { data, error } = await supabase
      .from("trips")
      .select("*")
      .eq("pack_id", packId)
      .order("started_at", { ascending: false });

    if (error) throw error;
    if (!userId || !data || !data.length) return data;

    const { data: left, error: leftError } = await supabase
      .from("trip_participants").select("trip_id").eq("user_id", userId).in("trip_id", data.map((t: any) => t.id));
    if (leftError) { participantsUnavailable(leftError); return data; }
    const leftIds = new Set((left ?? []).map((r: any) => r.trip_id));
    return data.map((t: any) => ({ ...t, left: leftIds.has(t.id) }));
  }
}
