import "server-only";
import { after } from "next/server";
import webpush from "web-push";
import { env } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { getDictionary, isLocale } from "@/lib/i18n";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildPushPayload, type PushNotificationRow } from "./payload";

type Subscription = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

const CONCURRENCY = 10;

/** Push needs the VAPID key pair, a contact subject and the service role. */
export function pushConfigured() {
  return Boolean(env.vapidPublicKey && serverEnv.vapidPrivateKey && serverEnv.vapidSubject && serverEnv.serviceRoleKey);
}

let vapidSet = false;
function ensureVapid() {
  if (vapidSet) return;
  webpush.setVapidDetails(serverEnv.vapidSubject!, env.vapidPublicKey!, serverEnv.vapidPrivateKey!);
  vapidSet = true;
}

/**
 * Sends queued notifications to their recipients' devices. Each notification
 * is claimed exactly once in the database, so concurrent runs never double-send.
 * Endpoints the push service reports as gone (404/410) are deleted.
 */
export async function deliverPendingPushes(limit = 100): Promise<{ sent: number; removed: number }> {
  if (!pushConfigured()) return { sent: 0, removed: 0 };
  ensureVapid();
  const admin = createAdminClient();
  if (!admin) return { sent: 0, removed: 0 };

  const { data, error } = await admin.rpc("claim_push_notifications", { p_limit: limit });
  if (error) throw new Error(`claim_push_notifications failed: ${error.message}`);
  const rows = (data ?? []) as PushNotificationRow[];
  if (rows.length === 0) return { sent: 0, removed: 0 };

  const recipients = [...new Set(rows.map((r) => r.recipient_id))];
  const { data: subs, error: subsError } = await admin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", recipients);
  if (subsError) throw new Error(`push_subscriptions read failed: ${subsError.message}`);

  const byUser = new Map<string, Subscription[]>();
  for (const sub of (subs ?? []) as Subscription[]) byUser.set(sub.user_id, [...(byUser.get(sub.user_id) ?? []), sub]);

  const gone = new Set<string>();
  let sent = 0;
  const jobs = rows.flatMap((row) => {
    const locale = isLocale(row.language) ? row.language : "en";
    const body = JSON.stringify(buildPushPayload(row, getDictionary(locale), locale));
    const urgency = row.type.startsWith("session_") ? "high" : "normal";
    return (byUser.get(row.recipient_id) ?? []).map((sub) => async () => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, {
          TTL: 60 * 60,
          urgency,
          timeout: 10_000,
        });
        sent += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.add(sub.id);
        else console.warn(`[push] delivery failed${status ? ` (${status})` : ""}`);
      }
    });
  });

  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    await Promise.all(jobs.slice(i, i + CONCURRENCY).map((job) => job()));
  }

  if (gone.size > 0) await admin.from("push_subscriptions").delete().in("id", [...gone]);
  return { sent, removed: gone.size };
}

/**
 * Delivers any queued push notifications after the current response has been
 * sent, so the person acting never waits on push services.
 */
export function schedulePushDelivery() {
  if (!pushConfigured()) return;
  after(async () => {
    try {
      await deliverPendingPushes();
    } catch (err) {
      console.error("[push]", err instanceof Error ? err.message : "delivery failed");
    }
  });
}
