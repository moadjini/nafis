"use server";

import { revalidatePath } from "next/cache";
import { authenticate, notAuthenticated, validate } from "@/lib/action-utils";
import { fail, ok, toErrorCode, type ActionResult } from "@/lib/errors";
import { adminRoleSchema, adminVerificationSchema, bonusLikesSchema, boostPostSchema, removeAvatarSchema } from "@/lib/validation";
import { schedulePushDelivery } from "@/lib/push/server";

// Each action runs with the caller's own session. The SQL functions check that
// the caller is a (non-suspended) Super Admin or moderator and raise
// not_allowed otherwise, so these cannot be abused by calling them directly.

export async function setRoleAction(input: unknown): Promise<ActionResult<{ role: string }>> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(adminRoleSchema, input);
  if (!v.success) return v.result;

  const { data, error } = await auth.supabase.rpc("admin_set_role", {
    p_handle: v.data.handle,
    p_role: v.data.role,
    p_reason: v.data.reason ?? null,
  });
  if (error) return fail(toErrorCode(error));
  schedulePushDelivery();
  revalidatePath("/admin", "layout");
  return ok({ role: data as string });
}

export async function setVerificationAction(input: unknown): Promise<ActionResult<{ verified: boolean }>> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(adminVerificationSchema, input);
  if (!v.success) return v.result;

  const { data, error } = await auth.supabase.rpc("admin_set_verification", {
    p_handle: v.data.handle,
    p_verified: v.data.verified,
    p_reason: v.data.reason ?? null,
  });
  if (error) return fail(toErrorCode(error));
  schedulePushDelivery();
  // The badge appears in feeds, profiles and replies.
  revalidatePath("/", "layout");
  return ok({ verified: data as boolean });
}

export async function removeAvatarAsModeratorAction(input: unknown): Promise<ActionResult> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(removeAvatarSchema, input);
  if (!v.success) return v.result;

  const { error } = await auth.supabase.rpc("mod_remove_avatar", {
    p_handle: v.data.handle,
    p_reason: v.data.reason ?? null,
  });
  if (error) return fail(toErrorCode(error));
  schedulePushDelivery();
  revalidatePath("/", "layout");
  return ok(null);
}

/** Super Admins only (checked in SQL). hours = 0 removes the boost. */
export async function boostPostAction(input: unknown): Promise<ActionResult<{ boostedUntil: string | null }>> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(boostPostSchema, input);
  if (!v.success) return v.result;

  const { data, error } = await auth.supabase.rpc("admin_boost_post", {
    p_post_id: v.data.postId,
    p_hours: v.data.hours,
    p_reason: v.data.reason ?? null,
  });
  if (error) return fail(toErrorCode(error));
  revalidatePath("/admin/promotions");
  return ok({ boostedUntil: (data as string | null) ?? null });
}

/** Super Admins only (checked in SQL). count = 0 removes the free likes. */
export async function setBonusLikesAction(input: unknown): Promise<ActionResult<{ count: number }>> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(bonusLikesSchema, input);
  if (!v.success) return v.result;

  const { data, error } = await auth.supabase.rpc("admin_set_bonus_likes", {
    p_post_id: v.data.postId,
    p_count: v.data.count,
    p_reason: v.data.reason ?? null,
  });
  if (error) return fail(toErrorCode(error));
  revalidatePath("/admin/promotions");
  return ok({ count: data as number });
}
