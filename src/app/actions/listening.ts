"use server";

import { revalidatePath } from "next/cache";
import { authenticate, notAuthenticated, validate } from "@/lib/action-utils";
import { fail, ok, toErrorCode, type ActionResult } from "@/lib/errors";
import type { MessageRow } from "@/lib/types";
import { listeningPreferencesSchema, messageSchema, sessionRequestSchema, uuidSchema } from "@/lib/validation";
import { schedulePushDelivery } from "@/lib/push/server";

export async function saveListeningPreferencesAction(input: unknown): Promise<ActionResult> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(listeningPreferencesSchema, input);
  if (!v.success) return v.result;

  const { error } = await auth.supabase.from("listening_preferences").upsert(
    {
      user_id: auth.user.id,
      available: v.data.available,
      languages: v.data.languages,
      topics: v.data.topics,
      note: v.data.note ?? null,
    },
    { onConflict: "user_id" },
  );
  if (error) return fail(toErrorCode(error));
  revalidatePath("/listening");
  return ok(null);
}

export async function requestSessionAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(sessionRequestSchema, input);
  if (!v.success) return v.result;

  const { data, error } = await auth.supabase.rpc("request_listening_session", {
    p_language: v.data.language,
    p_topic: v.data.topic ?? null,
    p_intro: v.data.intro ?? null,
    p_listener_handle: v.data.listenerHandle ?? null,
  });
  if (error) return fail(toErrorCode(error));
  schedulePushDelivery();
  revalidatePath("/listening");
  return ok({ id: data as string });
}

export async function respondToSessionAction(sessionId: string, accept: boolean): Promise<ActionResult<{ result: string }>> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(uuidSchema, sessionId);
  if (!v.success) return v.result;

  const { data, error } = await auth.supabase.rpc("respond_to_session", { p_session_id: v.data, p_accept: accept });
  if (error) return fail(toErrorCode(error));
  schedulePushDelivery();
  revalidatePath("/listening");
  revalidatePath(`/sessions/${v.data}`);
  return ok({ result: data as string });
}

export async function cancelSessionRequestAction(sessionId: string): Promise<ActionResult> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(uuidSchema, sessionId);
  if (!v.success) return v.result;

  const { error } = await auth.supabase.rpc("cancel_session_request", { p_session_id: v.data });
  if (error) return fail(toErrorCode(error));
  schedulePushDelivery();
  revalidatePath("/listening");
  revalidatePath(`/sessions/${v.data}`);
  return ok(null);
}

export async function endSessionAction(sessionId: string): Promise<ActionResult> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(uuidSchema, sessionId);
  if (!v.success) return v.result;

  const { error } = await auth.supabase.rpc("end_session", { p_session_id: v.data });
  if (error) return fail(toErrorCode(error));
  schedulePushDelivery();
  revalidatePath(`/sessions/${v.data}`);
  return ok(null);
}

export async function sendMessageAction(input: unknown): Promise<ActionResult<MessageRow>> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(messageSchema, input);
  if (!v.success) return v.result;

  // RLS verifies the sender is a participant of an open, unblocked session.
  const { data, error } = await auth.supabase
    .from("private_messages")
    .insert({ session_id: v.data.sessionId, sender_id: auth.user.id, content: v.data.content })
    .select("id, session_id, sender_id, content, created_at")
    .single();
  if (error) return fail(toErrorCode(error));
  schedulePushDelivery();
  return ok(data as MessageRow);
}
