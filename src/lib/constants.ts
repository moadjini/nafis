// Shared product vocabularies. Database CHECK constraints mirror these lists;
// keep both in sync when adding values.

export const REACTIONS = [
  { key: "heart", emoji: "❤️" },
  { key: "hug", emoji: "🫂" },
  { key: "support", emoji: "🫶" },
  { key: "here", emoji: "🤍" },
  { key: "peace", emoji: "🌿" },
  { key: "care", emoji: "💛" },
  { key: "hear_you", emoji: "🥺" },
] as const;

export type ReactionKey = (typeof REACTIONS)[number]["key"];
export const REACTION_KEYS = REACTIONS.map((r) => r.key) as [ReactionKey, ...ReactionKey[]];
export const REACTION_EMOJI: Record<ReactionKey, string> = Object.fromEntries(
  REACTIONS.map((r) => [r.key, r.emoji]),
) as Record<ReactionKey, string>;

export const TOPICS = [
  "loneliness",
  "grief",
  "family",
  "relationships",
  "friendship",
  "work_money",
  "studies",
  "health",
  "faith",
  "life_abroad",
  "stress",
  "self_worth",
  "hope",
  "other",
] as const;
export type Topic = (typeof TOPICS)[number];

export const RESPONSE_PREFERENCES = ["just_listen", "advice", "similar_experience", "express"] as const;
export type ResponsePreference = (typeof RESPONSE_PREFERENCES)[number];

/** Languages a post or listening session can be in. */
export const CONTENT_LANGUAGES = ["en", "so", "other"] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];

/** Interface languages. Add a dictionary in src/lib/i18n/dictionaries to extend. */
export const LOCALES = ["en", "so"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

export const AVATARS = [
  "leaf",
  "sprout",
  "wave",
  "sun",
  "moon",
  "cloud",
  "drop",
  "stone",
  "star",
  "initials",
] as const;
export type AvatarKey = (typeof AVATARS)[number];

export const REPORT_REASONS = [
  "harassment",
  "hate",
  "threat",
  "self_harm_concern",
  "spam",
  "sexual_content",
  "privacy",
  "impersonation",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_TARGETS = ["post", "reply", "user", "session", "message"] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const LIMITS = {
  postContent: 5000,
  caption: 300,
  reply: 2000,
  message: 2000,
  journalTitle: 150,
  journalContent: 20000,
  bio: 280,
  displayNameMin: 2,
  displayNameMax: 40,
  intro: 500,
  reportDetails: 1000,
  listenerNote: 200,
  moderationNote: 1000,
} as const;

export const AUDIO = {
  bucket: "voice-notes",
  maxBytes: 10 * 1024 * 1024,
  /** Hard ceiling enforced by the database; the configurable limit must be <= this. */
  absoluteMaxSeconds: 600,
  mimeTypes: [
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/mpeg",
    "audio/wav",
    "audio/x-wav",
    "audio/aac",
    "audio/x-m4a",
  ],
  signedUrlSeconds: 600,
} as const;
export type AudioMimeType = (typeof AUDIO.mimeTypes)[number];

/** Profile pictures: picked files are cropped in the browser, then decoded and
 *  re-encoded on the server (see src/lib/avatar-processing.ts). */
export const AVATAR_UPLOAD = {
  bucket: "avatars",
  /** Largest original file a user may pick. */
  sourceMaxBytes: 8 * 1024 * 1024,
  /** Largest cropped image the server accepts (stays under the 1 MB server-action body limit). */
  maxBytes: 900 * 1024,
  /** Output: square WebP, metadata stripped. */
  size: 512,
  acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
} as const;

export const STAFF_ROLES = ["moderator", "super_admin"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export const ROLES = ["member", "moderator", "super_admin"] as const;
export type Role = (typeof ROLES)[number];

/** Audit actions moderators may read; the rest are Super Admin only. */
export const MODERATION_ACTIONS = [
  "set_post_status",
  "set_reply_status",
  "update_report",
  "suspend_user",
  "lift_suspension",
  "remove_avatar",
] as const;
export const ADMIN_ACTIONS = [
  "set_role",
  "bootstrap_super_admin",
  "grant_verification",
  "revoke_verification",
  "boost_post",
  "unboost_post",
  "set_bonus_likes",
] as const;
export type AuditAction = (typeof MODERATION_ACTIONS)[number] | (typeof ADMIN_ACTIONS)[number];

/** Feed order: engagement-ranked (boosted posts first) or newest first. */
export const FEED_SORTS = ["top", "latest"] as const;
export type FeedSort = (typeof FEED_SORTS)[number];

/** Super Admin promotion limits (mirrored in SQL). */
export const PROMOTION = { maxBoostHours: 720, boostOptions: [6, 24, 72, 168], maxBonusLikes: 100000 } as const;

/** Moderators may suspend members for at most this many days. */
export const MODERATOR_MAX_SUSPENSION_DAYS = 30;

export const PAGE_SIZE = 15;
export const REPLY_PAGE_SIZE = 50;

export const LOCALE_COOKIE = "nafis-locale";
export const THEME_COOKIE = "nafis-theme";
