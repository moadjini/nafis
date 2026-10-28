"use server";

import { revalidatePath } from "next/cache";
import { authenticate, notAuthenticated, validate } from "@/lib/action-utils";
import { fail, ok, toErrorCode, type ActionResult } from "@/lib/errors";
import { schedulePushDelivery } from "@/lib/push/server";
import {
  handleSchema,
  moderationContentSchema,
  moderationReportSchema,
  reportSchema,
  suspendSchema,
} from "@/lib/validation";

export async function reportAction(input: unknown): Promise<ActionResult> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(reportSchema, input);
  if (!v.success) return v.result;

  const { error } = await auth.supabase.rpc("create_report", {
    p_target_type: v.data.targetType,
    p_reason: v.data.reason,
    p_target_id: v.data.targetId ?? null,
    p_target_handle: v.data.targetHandle ?? null,
    p_details: v.data.details ?? null,
  });
  if (error) return fail(toErrorCode(error));
  return ok(null);
}

export async function blockUserAction(handle: string): Promise<ActionResult> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(handleSchema, handle);
  if (!v.success) return v.result;

  const { error } = await auth.supabase.rpc("block_user", { p_handle: v.data });
  if (error) return fail(toErrorCode(error));
  schedulePushDelivery();
  revalidatePath("/", "layout");
  return ok(null);
}

export async function unblockUserAction(handle: string): Promise<ActionResult> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(handleSchema, handle);
  if (!v.success) return v.result;

  const { error } = await auth.supabase.rpc("unblock_user", { p_handle: v.data });
  if (error) return fail(toErrorCode(error));
  revalidatePath("/", "layout");
  return ok(null);
}

// ---- Moderation. The SQL functions re-check the moderator role. ------------------

export async function moderateContentAction(input: unknown): Promise<ActionResult> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(moderationContentSchema, input);
  if (!v.success) return v.result;

  const { error } = await auth.supabase.rpc("mod_set_content_status", {
    p_target_type: v.data.targetType,
    p_target_id: v.data.targetId,
    p_status: v.data.status,
    p_reason: v.data.reason ?? null,
  });
  if (error) return fail(toErrorCode(error));
  schedulePushDelivery();
  revalidatePath("/admin/moderation");
  return ok(null);
}

export async function updateReportAction(input: unknown): Promise<ActionResult> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(moderationReportSchema, input);
  if (!v.success) return v.result;

  const { error } = await auth.supabase.rpc("mod_update_report", {
    p_report_id: v.data.reportId,
    p_status: v.data.status,
    p_note: v.data.note ?? null,
  });
  if (error) return fail(toErrorCode(error));
  schedulePushDelivery();
  revalidatePath("/admin/moderation");
  return ok(null);
}

export async function suspendUserAction(input: unknown): Promise<ActionResult> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(suspendSchema, input);
  if (!v.success) return v.result;

  const { error } = await auth.supabase.rpc("mod_suspend_user", {
    p_handle: v.data.handle,
    p_days: v.data.days,
    p_reason: v.data.reason ?? null,
  });
  if (error) return fail(toErrorCode(error));
  schedulePushDelivery();
  revalidatePath("/admin/moderation");
  return ok(null);
}
