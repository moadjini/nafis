import type { Locale } from "@/lib/constants";
import type { Dictionary } from "@/lib/i18n";
import type { NotificationType } from "@/lib/types";

/** A queued notification, as returned by public.claim_push_notifications. */
export type PushNotificationRow = {
  id: string;
  recipient_id: string;
  type: NotificationType;
  related_post_id: string | null;
  related_session_id: string | null;
  data: Record<string, unknown> | null;
  language: string;
};

export type PushPayload = { title: string; body: string; url: string; tag: string; lang: Locale };

/**
 * Builds the text of a push notification. It is deliberately generic: no
 * names, no post or message content, because notifications appear on lock
 * screens and shared devices. The link is re-authorised when opened.
 */
export function buildPushPayload(row: PushNotificationRow, copy: Pick<Dictionary, "pushMessages">, locale: Locale): PushPayload {
  const body = copy.pushMessages.types[row.type] ?? copy.pushMessages.types.account_update;
  let url = "/notifications";
  let tag = `nafis:${row.type}`;
  if (row.related_session_id) {
    url = `/sessions/${row.related_session_id}`;
    tag = `nafis:session:${row.related_session_id}`;
  } else if (row.related_post_id) {
    url = `/post/${row.related_post_id}`;
    tag = `nafis:post:${row.related_post_id}`;
  }
  return { title: copy.pushMessages.title, body, url, tag, lang: locale };
}
