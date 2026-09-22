import { supabase } from "../db/supabaseClient";

const BUCKET = "trip-photos";

export interface UploadMediaInput {
  tripId: string;
  userId: string;
  fileBuffer: Buffer;
  mimeType: string;
  capturedAt: string;
  isPrivate?: boolean;
  lat?: number;
  lng?: number;
}

export class MediaService {
  async uploadMedia(input: UploadMediaInput) {
    // Real object storage, not base64-in-Postgres: that shortcut worked for
    // a handful of test photos but bloated every query on the trip enough
    // to hit Supabase's statement timeout once real usage kicked in.
    const ext = (input.mimeType.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const path = `${input.tripId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, input.fileBuffer, { contentType: input.mimeType, upsert: false });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const url = urlData.publicUrl;

    const { data, error } = await supabase
      .from("media")
      .insert({
        trip_id: input.tripId,
        user_id: input.userId,
        url,
        original_url: url, // original preserved from the start
        is_private: input.isPrivate ?? false,
        captured_at: input.capturedAt,
        lat: input.lat,
        lng: input.lng,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async saveEdit(mediaId: string, editedUrl: string) {
    // Non-destructive: original_url is never overwritten.
    // "Undo edit" / "restore original" always has something to restore to.
    const { data, error } = await supabase
      .from("media")
      .update({ url: editedUrl, edited: true })
      .eq("id", mediaId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async tagMedia(mediaId: string, taggedUserId?: string, place?: { name: string; lat: number; lng: number }) {
    const { error } = await supabase.from("media_tags").insert({
      media_id: mediaId,
      tagged_user_id: taggedUserId,
      place_name: place?.name,
      place_lat: place?.lat,
      place_lng: place?.lng,
    });

    if (error) throw error;
  }

  async updateLocation(mediaId: string, lat: number, lng: number) {
    const { error } = await supabase.from("media").update({ lat, lng }).eq("id", mediaId);
    if (error) throw error;
  }

  async getTagsForMedia(mediaId: string) {
    const { data, error } = await supabase
      .from("media_tags")
      .select("tagged_user_id, place_name, users(display_name)")
      .eq("media_id", mediaId);

    if (error) throw error;
    return data;
  }

  async getMediaForTrip(tripId: string, includePrivate = false) {
    // Joins the uploader's display name so the client doesn't need a
    // separate lookup just to show "who posted this."
    let query = supabase
      .from("media")
      .select("*, users(display_name)")
      .eq("trip_id", tripId);
    if (!includePrivate) query = query.eq("is_private", false);

    const { data, error } = await query.order("captured_at", { ascending: true });
    if (error) throw error;
    return data;
  }

  async addComment(mediaId: string, userId: string, text: string) {
    const { data, error } = await supabase
      .from("comments")
      .insert({ media_id: mediaId, user_id: userId, text })
      .select("*, users(display_name)")
      .single();

    if (error) throw error;
    return data;
  }

  async getComments(mediaId: string) {
    const { data, error } = await supabase
      .from("comments")
      .select("*, users(display_name)")
      .eq("media_id", mediaId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return data;
  }

  async setReaction(mediaId: string, userId: string, emoji: string) {
    // One reaction per user per photo - picking a new emoji replaces
    // their previous one, matching how most apps handle this.
    const { error } = await supabase
      .from("media_reactions")
      .upsert({ media_id: mediaId, user_id: userId, emoji }, { onConflict: "media_id,user_id" });

    if (error) throw error;
  }

  async removeReaction(mediaId: string, userId: string) {
    const { error } = await supabase
      .from("media_reactions")
      .delete()
      .eq("media_id", mediaId)
      .eq("user_id", userId);

    if (error) throw error;
  }

  async getReactionSummary(mediaId: string) {
    const { data, error } = await supabase
      .from("media_reactions")
      .select("emoji, user_id")
      .eq("media_id", mediaId);

    if (error) throw error;

    const counts: Record<string, number> = {};
    (data ?? []).forEach((r: any) => { counts[r.emoji] = (counts[r.emoji] ?? 0) + 1; });
    return { counts, raw: data };
  }
}
