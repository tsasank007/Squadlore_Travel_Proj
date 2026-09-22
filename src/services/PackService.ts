import { supabase } from "../db/supabaseClient";

const MAX_MEMBERS_PER_PACK = 10; // MVP soft cap - enforced here, not in the DB,
                                  // so raising it later is a one-line change.

export interface CreatePackInput {
  name: string;
  icon?: string;
  color?: string;
  creatorId: string;
  isPersistent?: boolean;
}

export class PackService {
  async createPack(input: CreatePackInput) {
    const { data: pack, error } = await supabase
      .from("packs")
      .insert({
        name: input.name,
        icon: input.icon,
        color: input.color,
        creator_id: input.creatorId,
        is_persistent: input.isPersistent ?? true,
      })
      .select()
      .single();

    if (error) throw error;

    // Creator automatically joins as admin
    await this.addMember(pack.id, input.creatorId, "admin");

    return pack;
  }

  async addMember(packId: string, userId: string, role: "admin" | "member" = "member") {
    const currentCount = await this.getMemberCount(packId);
    if (currentCount >= MAX_MEMBERS_PER_PACK) {
      throw new Error(
        `Pack/Toli is at the ${MAX_MEMBERS_PER_PACK}-member limit for now.`
      );
    }

    const { error } = await supabase
      .from("pack_members")
      .insert({ pack_id: packId, user_id: userId, role });

    if (error) throw error;
  }

  async getMemberCount(packId: string): Promise<number> {
    const { count, error } = await supabase
      .from("pack_members")
      .select("*", { count: "exact", head: true })
      .eq("pack_id", packId);

    if (error) throw error;
    return count ?? 0;
  }

  async setMemberStatus(packId: string, userId: string, status: "active" | "paused" | "offline") {
    // Backs the pause/resume toggle. Pausing only changes status here -
    // it never removes the pack_members row, so rejoining is instant
    // and no "left the group" event is ever generated.
    const { error } = await supabase
      .from("pack_members")
      .update({ status })
      .eq("pack_id", packId)
      .eq("user_id", userId);

    if (error) throw error;
  }

  async findMatchingPack(memberUserIds: string[]) {
    // Powers "looks like you already have a Pack/Toli with these people".
    // Simple MVP version: find a pack whose member set is an exact match.
    // Can be made fuzzier (majority overlap) once we see real usage patterns.
    const { data, error } = await supabase.rpc("find_pack_by_exact_members", {
      member_ids: memberUserIds,
    });

    if (error) throw error;
    return data?.[0] ?? null;
  }

  async listPacksForUser(userId: string) {
    const { data, error } = await supabase
      .from("pack_members")
      .select("pack_id, packs(*)")
      .eq("user_id", userId);

    if (error) throw error;
    return (data ?? []).map((row: any) => row.packs);
  }

  async listMembers(packId: string) {
    const { data, error } = await supabase
      .from("pack_members")
      .select("user_id, role, status, users(display_name, avatar_url)")
      .eq("pack_id", packId);

    if (error) throw error;
    return data;
  }

  private generateJoinCode(): string {
    // Short, URL-safe, good enough for a shared-with-friends invite link
    // (not a security boundary - anyone with the link can join).
    return Math.random().toString(36).slice(2, 10);
  }

  async getOrCreateJoinLink(packId: string) {
    const { data: pack, error } = await supabase.from("packs").select("join_code").eq("id", packId).single();
    if (error) throw error;

    if (pack.join_code) return pack.join_code;

    const joinCode = this.generateJoinCode();
    const { error: updateError } = await supabase.from("packs").update({ join_code: joinCode }).eq("id", packId);
    if (updateError) throw updateError;
    return joinCode;
  }

  async getPackByJoinCode(joinCode: string) {
    const { data, error } = await supabase.from("packs").select("id, name").eq("join_code", joinCode).maybeSingle();
    if (error) throw error;
    return data;
  }

  async joinByCode(joinCode: string, userId: string) {
    const pack = await this.getPackByJoinCode(joinCode);
    if (!pack) throw new Error("This invite link isn't valid or has been removed.");

    const { data: existing } = await supabase
      .from("pack_members")
      .select("user_id")
      .eq("pack_id", pack.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!existing) await this.addMember(pack.id, userId, "member");
    return pack;
  }
}
