import { supabase } from "../db/supabaseClient";

export interface CreateUserInput {
  phoneNumber: string;
  displayName: string;
  avatarUrl?: string;
}

// A real bug, found from a real report: phone numbers were matched as an
// EXACT string. "2065551234", "(206) 555-1234", and "+1 206-555-1234" all
// identify the same person, but an exact match treats them as three
// different people - silently creating a brand-new, empty account and
// making every past i'Hive, trip, and photo look "lost." This normalizes
// before every match AND every insert, so formatting can never matter again.
export function normalizePhone(phone: string): string {
  const stripped = phone.replace(/[^\d+]/g, "");
  // "+12065551234" and "2065551234" are the same US number typed two
  // common ways - treat a leading +1 (11 digits total) the same as its
  // bare 10-digit form, rather than two different accounts.
  if (/^\+1\d{10}$/.test(stripped)) return stripped.slice(2);
  return stripped;
}

export class UserService {
  // MVP only: no auth/SMS-verification flow yet - that belongs in
  // Phase 1 proper, alongside the invite-by-phone-number flow.
  // This exists so we can create test users for the end-to-end loop.

  async findOrCreateByPhone(input: CreateUserInput) {
    const phone = normalizePhone(input.phoneNumber);
    const { data: existing, error: findError } = await supabase
      .from("users")
      .select("*")
      .eq("phone_number", phone)
      .maybeSingle();

    if (findError) throw findError;

    if (existing) {
      // An invited person starts as a "Pending member" placeholder. The
      // moment they actually open the app and enter their real name, we
      // want that to replace the placeholder - not get silently ignored.
      if (input.displayName && input.displayName !== existing.display_name) {
        const { data: updated, error: updateError } = await supabase
          .from("users")
          .update({ display_name: input.displayName })
          .eq("id", existing.id)
          .select()
          .single();

        if (updateError) throw updateError;
        return updated;
      }
      return existing;
    }

    const { data, error } = await supabase
      .from("users")
      .insert({
        phone_number: phone,
        display_name: input.displayName,
        avatar_url: input.avatarUrl,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async setAvatar(userId: string, fileBuffer: Buffer, mimeType: string) {
    // Reuses the existing "trip-photos" bucket under an avatars/ prefix -
    // no second bucket to create in Supabase, one less manual setup step.
    const ext = (mimeType.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const path = `avatars/${userId}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("trip-photos")
      .upload(path, fileBuffer, { contentType: mimeType, upsert: false });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from("trip-photos").getPublicUrl(path);

    const { data, error } = await supabase
      .from("users")
      .update({ avatar_url: urlData.publicUrl })
      .eq("id", userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}
