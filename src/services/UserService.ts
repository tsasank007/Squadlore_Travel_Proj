import { supabase } from "../db/supabaseClient";

export interface CreateUserInput {
  phoneNumber: string;
  displayName: string;
  avatarUrl?: string;
}

export class UserService {
  // MVP only: no auth/SMS-verification flow yet - that belongs in
  // Phase 1 proper, alongside the invite-by-phone-number flow.
  // This exists so we can create test users for the end-to-end loop.

  async findOrCreateByPhone(input: CreateUserInput) {
    const { data: existing, error: findError } = await supabase
      .from("users")
      .select("*")
      .eq("phone_number", input.phoneNumber)
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
        phone_number: input.phoneNumber,
        display_name: input.displayName,
        avatar_url: input.avatarUrl,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}
