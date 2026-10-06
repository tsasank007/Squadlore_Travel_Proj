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

  // Accounts made before phone numbers were normalized were saved exactly as
  // typed ("+15551234567", "(555) 123-4567", ...). Looking only for the
  // normalized form would NOT find them and would quietly create a second,
  // empty account for the same person - the "I lost all my hives" bug again.
  // So: try the normalized form first (fast), then compare normalized forms of
  // the stored numbers. The users table is tiny at this stage; once it's large,
  // replace the scan with a one-time migration to a normalized, indexed column.
  private async findByPhone(normalized: string) {
    const { data: exact, error: exactErr } = await supabase
      .from("users").select("*").eq("phone_number", normalized).maybeSingle();
    if (exactErr) throw exactErr;
    if (exact) return exact;

    const { data: all, error: allErr } = await supabase
      .from("users").select("id, phone_number, created_at");
    if (allErr) throw allErr;
    const matches = (all ?? []).filter((u: any) => normalizePhone(u.phone_number || "") === normalized);
    if (!matches.length) return null;

    matches.sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)));
    let chosen = matches[0]; // the original account, unless another one clearly holds the person's data
    if (matches.length > 1) {
      // The same person ended up with more than one account (that's the bug
      // being fixed). Keep the one that belongs to the most i'Hives.
      const { data: memberships } = await supabase
        .from("pack_members").select("user_id").in("user_id", matches.map((m: any) => m.id));
      const counts: Record<string, number> = {};
      (memberships ?? []).forEach((m: any) => { counts[m.user_id] = (counts[m.user_id] || 0) + 1; });
      chosen = matches.reduce((best: any, m: any) => ((counts[m.id] || 0) > (counts[best.id] || 0) ? m : best), matches[0]);
    }

    // Best-effort: store it normalized from now on so the next lookup is the
    // fast path and the choice above stays stable. A failure here (e.g. a
    // uniqueness clash) is harmless - we still return the right account.
    await supabase.from("users").update({ phone_number: normalized }).eq("id", chosen.id);

    const { data: full, error: fullErr } = await supabase.from("users").select("*").eq("id", chosen.id).single();
    if (fullErr) throw fullErr;
    return full;
  }

  async findOrCreateByPhone(input: CreateUserInput) {
    const phone = normalizePhone(input.phoneNumber);
    const existing = await this.findByPhone(phone);

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
