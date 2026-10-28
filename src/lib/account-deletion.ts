import type { SupabaseClient } from "@supabase/supabase-js";
import { AUDIO, AVATAR_UPLOAD } from "@/lib/constants";

/**
 * Deletes a user's files and auth account with a SERVICE-ROLE client.
 * The caller must already have verified that `userId` is the signed-in user.
 * Database rows follow through ON DELETE CASCADE / SET NULL (see migrations).
 */
export async function deleteUserAccount(
  admin: SupabaseClient,
  userId: string,
): Promise<{ ok: true } | { ok: false; step: "last_super_admin" | "list_audio" | "remove_audio" | "remove_avatar" | "delete_user" }> {
  // The database refuses to lose its last Super Admin; say so up front.
  const { data: role } = await admin.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  if (role?.role === "super_admin") {
    const { count } = await admin
      .from("user_roles")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "super_admin")
      .neq("user_id", userId);
    if (!count) return { ok: false, step: "last_super_admin" };
  }

  const { data: objects, error: listError } = await admin.rpc("voice_objects_owned_by", { p_user: userId });
  if (listError) return { ok: false, step: "list_audio" };
  const names = ((objects ?? []) as { name: string }[]).map((o) => o.name);
  for (let i = 0; i < names.length; i += 100) {
    const { error } = await admin.storage.from(AUDIO.bucket).remove(names.slice(i, i + 100));
    if (error) return { ok: false, step: "remove_audio" };
  }

  const { data: profile } = await admin.from("profiles").select("avatar_path").eq("id", userId).maybeSingle();
  if (profile?.avatar_path) {
    const { error } = await admin.storage.from(AVATAR_UPLOAD.bucket).remove([profile.avatar_path as string]);
    if (error) return { ok: false, step: "remove_avatar" };
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) return { ok: false, step: "delete_user" };
  return { ok: true };
}
