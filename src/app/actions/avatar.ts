"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { authenticate, notAuthenticated } from "@/lib/action-utils";
import { processAvatarImage } from "@/lib/avatar-processing";
import { AVATAR_UPLOAD } from "@/lib/constants";
import { fail, ok, toErrorCode, type ActionResult } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stores a new profile picture for the signed-in user.
 *
 * Why the service role is used: the `avatars` bucket and `profiles.avatar_path`
 * have no client write access at all, so only images that passed server-side
 * decoding and re-encoding can ever be stored. The admin client is used only
 * after the session is verified and only for this user's row and a new random
 * object name.
 */
export async function uploadAvatarAction(formData: FormData): Promise<ActionResult<{ path: string }>> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return fail("avatar_invalid", { avatar: "empty" });
  if (file.size > AVATAR_UPLOAD.maxBytes) return fail("avatar_invalid", { avatar: "too_large" });

  // Suspension check + rate limit, enforced in the database as this user.
  const { error: gateError } = await auth.supabase.rpc("register_avatar_upload");
  if (gateError) return fail(toErrorCode(gateError));

  const processed = await processAvatarImage(await file.arrayBuffer());
  if (!processed.ok) return fail("avatar_invalid", { avatar: processed.error });

  const admin = createAdminClient();
  if (!admin) return fail("configuration");

  const { data: current } = await auth.supabase.from("profiles").select("avatar_path").eq("id", auth.user.id).single();

  const path = `${randomUUID()}.webp`;
  const { error: uploadError } = await admin.storage
    .from(AVATAR_UPLOAD.bucket)
    .upload(path, processed.data, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
  if (uploadError) return fail("generic");

  const { error: updateError } = await admin.from("profiles").update({ avatar_path: path }).eq("id", auth.user.id);
  if (updateError) {
    await admin.storage.from(AVATAR_UPLOAD.bucket).remove([path]);
    return fail("generic");
  }

  if (current?.avatar_path) await admin.storage.from(AVATAR_UPLOAD.bucket).remove([current.avatar_path as string]);
  revalidatePath("/", "layout");
  return ok({ path });
}

export async function removeAvatarAction(): Promise<ActionResult> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const admin = createAdminClient();
  if (!admin) return fail("configuration");

  const { data: current } = await auth.supabase.from("profiles").select("avatar_path").eq("id", auth.user.id).single();
  if (!current?.avatar_path) return ok(null);

  const { error } = await admin.from("profiles").update({ avatar_path: null }).eq("id", auth.user.id);
  if (error) return fail("generic");
  await admin.storage.from(AVATAR_UPLOAD.bucket).remove([current.avatar_path as string]);
  revalidatePath("/", "layout");
  return ok(null);
}
