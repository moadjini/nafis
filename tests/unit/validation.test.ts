import { describe, expect, it } from "vitest";
import {
  feedQuerySchema,
  journalSchema,
  onboardingSchema,
  profileSchema,
  reactionSchema,
  replySchema,
  reportSchema,
  resetPasswordSchema,
  signUpSchema,
  textPostSchema,
  voicePostSchema,
} from "@/lib/validation";

const uuid = "4f1d6c2e-8a3b-4c5d-9e7f-0a1b2c3d4e5f";

describe("auth schemas", () => {
  it("normalises email and enforces password length", () => {
    const ok = signUpSchema.safeParse({ email: "  Person@Example.COM ", password: "longenough" });
    expect(ok.success && ok.data.email).toBe("person@example.com");
    expect(signUpSchema.safeParse({ email: "nope", password: "longenough" }).success).toBe(false);
    const short = signUpSchema.safeParse({ email: "a@b.co", password: "short" });
    expect(short.success).toBe(false);
    expect(short.error?.issues[0]?.message).toBe("passwordShort");
  });

  it("requires matching passwords on reset", () => {
    expect(resetPasswordSchema.safeParse({ password: "abcdefgh", confirm: "abcdefgh" }).success).toBe(true);
    const mismatch = resetPasswordSchema.safeParse({ password: "abcdefgh", confirm: "abcdefgx" });
    expect(mismatch.success).toBe(false);
    expect(mismatch.error?.issues[0]?.message).toBe("passwordMismatch");
  });
});

describe("onboarding and profile", () => {
  const base = {
    language: "so",
    displayName: "Webi Deggan",
    avatarKey: "leaf",
    listening: { available: true, languages: ["so", "en"], topics: ["grief"] },
    acceptedGuidelines: true,
  };

  it("accepts a valid onboarding payload", () => {
    expect(onboardingSchema.safeParse(base).success).toBe(true);
  });

  it("requires accepting the guidelines and a sensible name", () => {
    expect(onboardingSchema.safeParse({ ...base, acceptedGuidelines: false }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...base, displayName: "x" }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...base, avatarKey: "photo" }).success).toBe(false);
  });

  it("validates handles", () => {
    const ok = profileSchema.safeParse({ displayName: "Quiet River", handle: "Quiet_River_12", avatarKey: "moon" });
    expect(ok.success && ok.data.handle).toBe("quiet_river_12");
    expect(profileSchema.safeParse({ displayName: "Quiet River", handle: "no spaces", avatarKey: "moon" }).success).toBe(false);
    expect(profileSchema.safeParse({ displayName: "Quiet River", handle: "ab", avatarKey: "moon" }).success).toBe(false);
  });
});

describe("posts", () => {
  it("requires non-empty text and caps length", () => {
    const meta = { language: "en", responsePreference: "just_listen" };
    expect(textPostSchema.safeParse({ ...meta, content: "   " }).success).toBe(false);
    expect(textPostSchema.safeParse({ ...meta, content: "a".repeat(5001) }).success).toBe(false);
    const ok = textPostSchema.safeParse({ ...meta, content: "  hello  " });
    expect(ok.success && ok.data.content).toBe("hello");
    expect(ok.success && ok.data.asDraft).toBe(false);
  });

  it("rejects unknown response preferences and topics", () => {
    expect(textPostSchema.safeParse({ language: "en", responsePreference: "debate", content: "x" }).success).toBe(false);
    expect(textPostSchema.safeParse({ language: "en", responsePreference: "advice", content: "x", topic: "politics" }).success).toBe(false);
  });

  it("only accepts random object names for voice posts (no folders, no user ids)", () => {
    const meta = { language: "so", responsePreference: "express", audioMimeType: "audio/webm", durationSeconds: 42 };
    expect(voicePostSchema.safeParse({ ...meta, audioPath: `${uuid}.webm` }).success).toBe(true);
    expect(voicePostSchema.safeParse({ ...meta, audioPath: `${uuid}/${uuid}.webm` }).success).toBe(false);
    expect(voicePostSchema.safeParse({ ...meta, audioPath: `../${uuid}.webm` }).success).toBe(false);
    expect(voicePostSchema.safeParse({ ...meta, audioPath: `${uuid}.exe` }).success).toBe(false);
    expect(voicePostSchema.safeParse({ ...meta, audioPath: `${uuid}.webm`, audioMimeType: "video/mp4" }).success).toBe(false);
    expect(voicePostSchema.safeParse({ ...meta, audioPath: `${uuid}.webm`, durationSeconds: 0 }).success).toBe(false);
  });

  it("validates feed cursors", () => {
    expect(feedQuerySchema.safeParse({ cursor: { at: "2026-10-27T10:00:00.000Z", id: uuid } }).success).toBe(true);
    expect(feedQuerySchema.safeParse({ cursor: { at: "yesterday", id: uuid } }).success).toBe(false);
  });
});

describe("reactions, replies, reports, journal", () => {
  it("allows only the curated reaction set (or null to remove)", () => {
    expect(reactionSchema.safeParse({ targetType: "post", targetId: uuid, reaction: "hug" }).success).toBe(true);
    expect(reactionSchema.safeParse({ targetType: "post", targetId: uuid, reaction: null }).success).toBe(true);
    expect(reactionSchema.safeParse({ targetType: "post", targetId: uuid, reaction: "angry" }).success).toBe(false);
  });

  it("caps reply length", () => {
    expect(replySchema.safeParse({ postId: uuid, content: "I'm here to listen." }).success).toBe(true);
    expect(replySchema.safeParse({ postId: uuid, content: "a".repeat(2001) }).success).toBe(false);
  });

  it("requires a handle for user reports and an id otherwise", () => {
    expect(reportSchema.safeParse({ targetType: "user", targetHandle: "quiet_river_1", reason: "harassment" }).success).toBe(true);
    expect(reportSchema.safeParse({ targetType: "user", reason: "harassment" }).success).toBe(false);
    expect(reportSchema.safeParse({ targetType: "post", targetId: uuid, reason: "self_harm_concern" }).success).toBe(true);
    expect(reportSchema.safeParse({ targetType: "post", reason: "spam" }).success).toBe(false);
  });

  it("lets journal drafts be empty but not saved entries", () => {
    expect(journalSchema.safeParse({ content: "", isDraft: true }).success).toBe(true);
    expect(journalSchema.safeParse({ content: "  ", isDraft: false }).success).toBe(false);
  });
});
