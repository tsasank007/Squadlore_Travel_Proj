import { supabase } from "../db/supabaseClient";

export interface StartTripInput {
  packId: string;
  name: string;
  discussionLocation?: string;
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

  async listTripsForPack(packId: string) {
    const { data, error } = await supabase
      .from("trips")
      .select("*")
      .eq("pack_id", packId)
      .order("started_at", { ascending: false });

    if (error) throw error;
    return data;
  }
}
