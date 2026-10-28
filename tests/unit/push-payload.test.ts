import { describe, expect, it } from "vitest";
import { LOCALES } from "@/lib/constants";
import { getDictionary } from "@/lib/i18n";
import { buildPushPayload, type PushNotificationRow } from "@/lib/push/payload";
import type { NotificationType } from "@/lib/types";

const TYPES: NotificationType[] = [
  "post_reply",
  "reply_reply",
  "reaction_summary",
  "session_request",
  "session_accepted",
  "session_declined",
  "session_cancelled",
  "session_ended",
  "session_message",
  "moderation_notice",
  "account_update",
];

const POST = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";

function row(type: NotificationType, extra: Partial<PushNotificationRow> = {}): PushNotificationRow {
  return { id: "n", recipient_id: "r", type, related_post_id: null, related_session_id: null, data: { count: 3 }, language: "en", ...extra };
}

describe("buildPushPayload", () => {
  it("has generic copy for every notification type in both languages, with no names or placeholders", () => {
    for (const locale of LOCALES) {
      const dict = getDictionary(locale);
      for (const type of TYPES) {
        const payload = buildPushPayload(row(type), dict, locale);
        expect(payload.title).toBe("Nafis");
        expect(payload.body.length).toBeGreaterThan(5);
        expect(payload.body).not.toMatch(/[{}]/);
        expect(payload.lang).toBe(locale);
      }
    }
  });

  it("never includes content passed along with the notification", () => {
    const payload = buildPushPayload(row("post_reply", { data: { content: "very private words", actor: "Hodan" } }), getDictionary("en"), "en");
    expect(JSON.stringify(payload)).not.toMatch(/private words|Hodan/);
  });

  it("links to the related session or post, otherwise to notifications, with a collapsing tag", () => {
    const en = getDictionary("en");
    expect(buildPushPayload(row("session_message", { related_session_id: SESSION }), en, "en")).toMatchObject({
      url: `/sessions/${SESSION}`,
      tag: `nafis:session:${SESSION}`,
    });
    expect(buildPushPayload(row("post_reply", { related_post_id: POST }), en, "en")).toMatchObject({ url: `/post/${POST}`, tag: `nafis:post:${POST}` });
    expect(buildPushPayload(row("account_update"), en, "en")).toMatchObject({ url: "/notifications", tag: "nafis:account_update" });
  });
});
