"use server";

import { z } from "zod";
import { authenticate, notAuthenticated, validate } from "@/lib/action-utils";
import { fail, ok, toErrorCode, type ActionResult } from "@/lib/errors";
import { pushConfigured } from "@/lib/push/server";
import { pushSubscriptionSchema } from "@/lib/validation";

/** Links this browser's push endpoint to the signed-in account. */
export async function savePushSubscriptionAction(input: unknown): Promise<ActionResult> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  if (!pushConfigured()) return fail("configuration");
  const v = validate(pushSubscriptionSchema, input);
  if (!v.success) return v.result;

  const { error } = await auth.supabase.rpc("register_push_subscription", {
    p_endpoint: v.data.endpoint,
    p_p256dh: v.data.keys.p256dh,
    p_auth: v.data.keys.auth,
  });
  if (error) return fail(toErrorCode(error));
  return ok(null);
}

/** Forgets this browser's endpoint (turning push off, or signing out). */
export async function removePushSubscriptionAction(endpoint: unknown): Promise<ActionResult> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(z.url({ protocol: /^https$/ }).max(1024), endpoint);
  if (!v.success) return v.result;

  const { error } = await auth.supabase.rpc("unregister_push_subscription", { p_endpoint: v.data });
  if (error) return fail(toErrorCode(error));
  return ok(null);
}
