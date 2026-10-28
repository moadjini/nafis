"use server";

import { revalidatePath } from "next/cache";
import { authenticate, notAuthenticated, validate } from "@/lib/action-utils";
import { fail, ok, toErrorCode, type ActionResult } from "@/lib/errors";
import type { NotificationRow } from "@/lib/types";
import { journalSchema, uuidSchema } from "@/lib/validation";
import { z } from "zod";

// ---- Journal (owner-only by RLS) -------------------------------------------------

export async function saveJournalEntryAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(journalSchema, input);
  if (!v.success) return v.result;
  const d = v.data;

  if (d.id) {
    const { data, error } = await auth.supabase
      .from("journal_entries")
      .update({ title: d.title ?? null, content: d.content, is_draft: d.isDraft })
      .eq("id", d.id)
      .eq("user_id", auth.user.id)
      .select("id");
    if (error) return fail(toErrorCode(error));
    if (!data?.length) return fail("not_found");
    revalidatePath("/journal");
    return ok({ id: d.id });
  }

  const { data, error } = await auth.supabase
    .from("journal_entries")
    .insert({ user_id: auth.user.id, title: d.title ?? null, content: d.content, is_draft: d.isDraft })
    .select("id")
    .single();
  if (error) return fail(toErrorCode(error));
  revalidatePath("/journal");
  return ok({ id: data.id as string });
}

export async function deleteJournalEntryAction(id: string): Promise<ActionResult> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(uuidSchema, id);
  if (!v.success) return v.result;

  const { data, error } = await auth.supabase
    .from("journal_entries")
    .delete()
    .eq("id", v.data)
    .eq("user_id", auth.user.id)
    .select("id");
  if (error) return fail(toErrorCode(error));
  if (!data?.length) return fail("not_found");
  revalidatePath("/journal");
  return ok(null);
}

// ---- Notifications (recipient-only by RLS) ---------------------------------------

export async function markNotificationsReadAction(ids: string[] | "all"): Promise<ActionResult> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();

  let query = auth.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", auth.user.id)
    .is("read_at", null);

  if (ids !== "all") {
    const v = validate(z.array(uuidSchema).min(1).max(100), ids);
    if (!v.success) return v.result;
    query = query.in("id", v.data);
  }

  const { error } = await query;
  if (error) return fail(toErrorCode(error));
  revalidatePath("/notifications");
  return ok(null);
}

/** Clears unread notifications tied to a post or session the user just opened. */
export async function markRelatedNotificationsReadAction(kind: "post" | "session", id: string): Promise<ActionResult> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(uuidSchema, id);
  if (!v.success) return v.result;

  const { error } = await auth.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", auth.user.id)
    .eq(kind === "post" ? "related_post_id" : "related_session_id", v.data)
    .is("read_at", null);
  if (error) return fail(toErrorCode(error));
  return ok(null);
}

export async function loadNotificationsAction(cursorAt: string | null): Promise<ActionResult<NotificationRow[]>> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(z.iso.datetime({ offset: true }).nullable(), cursorAt);
  if (!v.success) return v.result;

  const { data, error } = await auth.supabase.rpc("get_notifications", { p_limit: 30, p_cursor_at: v.data });
  if (error) return fail(toErrorCode(error));
  return ok((data ?? []) as NotificationRow[]);
}

export async function getUnreadCountAction(): Promise<number> {
  const auth = await authenticate();
  if (!auth) return 0;
  const { data } = await auth.supabase.rpc("get_unread_notification_count");
  return (data as number | null) ?? 0;
}
