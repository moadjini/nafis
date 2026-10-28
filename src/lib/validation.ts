import { z } from "zod";
import {
  AUDIO,
  AVATARS,
  CONTENT_LANGUAGES,
  FEED_SORTS,
  LIMITS,
  LOCALES,
  PROMOTION,
  REACTION_KEYS,
  REPORT_REASONS,
  REPORT_TARGETS,
  RESPONSE_PREFERENCES,
  ROLES,
  THEMES,
  TOPICS,
} from "@/lib/constants";

// Shared by client forms (React Hook Form) and server actions. Messages are
// i18n keys under auth.errors / errors, resolved by the UI.

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const uuidSchema = z.uuid();
export const topicSchema = z.enum(TOPICS);
export const contentLanguageSchema = z.enum(CONTENT_LANGUAGES);
export const localeSchema = z.enum(LOCALES);
export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,24}$/);

// ---- Auth ---------------------------------------------------------------------

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email({ message: "invalidEmail" }));
export const passwordSchema = z.string().min(8, "passwordShort").max(72, "passwordLong");

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "passwordRequired").max(72, "passwordLong"),
});

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "passwordMismatch", path: ["confirm"] });

// ---- Profile & onboarding ----------------------------------------------------------

export const displayNameSchema = z
  .string()
  .trim()
  .min(LIMITS.displayNameMin)
  .max(LIMITS.displayNameMax);

export const onboardingSchema = z.object({
  language: localeSchema,
  displayName: displayNameSchema,
  avatarKey: z.enum(AVATARS),
  listening: z.object({
    available: z.boolean(),
    languages: z.array(contentLanguageSchema).min(1).max(3),
    topics: z.array(topicSchema).max(TOPICS.length),
  }),
  acceptedGuidelines: z.literal(true),
});

export const profileSchema = z.object({
  displayName: displayNameSchema,
  handle: handleSchema,
  avatarKey: z.enum(AVATARS),
  bio: optionalText(LIMITS.bio),
});

export const preferencesSchema = z.object({
  language: localeSchema.optional(),
  theme: z.enum(THEMES).optional(),
  hiddenTopics: z.array(topicSchema).max(TOPICS.length).optional(),
});

export const notificationPreferencesSchema = z.object({
  replies: z.boolean(),
  reaction_summaries: z.boolean(),
  sessions: z.boolean(),
  email_enabled: z.boolean(),
});

// ---- Posts -----------------------------------------------------------------------

const postMetaSchema = z.object({
  topic: topicSchema.nullable().optional(),
  language: contentLanguageSchema,
  responsePreference: z.enum(RESPONSE_PREFERENCES),
  asDraft: z.boolean().default(false),
});

export const textPostSchema = postMetaSchema.extend({
  content: trimmed(LIMITS.postContent).min(1),
  caption: optionalText(LIMITS.caption),
});

export const voicePostSchema = postMetaSchema.extend({
  audioPath: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webm|ogg|m4a|mp3|wav|aac)$/),
  audioMimeType: z.enum(AUDIO.mimeTypes),
  durationSeconds: z.number().int().min(1).max(AUDIO.absoluteMaxSeconds),
  caption: optionalText(LIMITS.caption),
});

export const updatePostSchema = z.object({
  postId: uuidSchema,
  content: trimmed(LIMITS.postContent).min(1).optional(),
  caption: optionalText(LIMITS.caption),
  topic: topicSchema.nullable(),
  language: contentLanguageSchema,
  responsePreference: z.enum(RESPONSE_PREFERENCES),
  publish: z.boolean().default(false),
});

export const feedQuerySchema = z.object({
  cursor: z
    .union([
      z.object({ at: z.iso.datetime({ offset: true }), id: uuidSchema }),
      z.object({ rankedAt: z.iso.datetime({ offset: true }), offset: z.number().int().min(0).max(1000) }),
    ])
    .nullable()
    .optional(),
  sort: z.enum(FEED_SORTS).optional(),
  postType: z.enum(["text", "voice"]).optional(),
  topic: topicSchema.optional(),
  language: contentLanguageSchema.optional(),
  seeking: z.boolean().optional(),
  authorHandle: handleSchema.optional(),
  bookmarked: z.boolean().optional(),
  inviting: z.boolean().optional(),
});

export const reactionSchema = z.object({
  targetType: z.enum(["post", "reply"]),
  targetId: uuidSchema,
  reaction: z.enum(REACTION_KEYS).nullable(),
});

// ---- Replies -------------------------------------------------------------------

export const replySchema = z.object({
  postId: uuidSchema,
  parentReplyId: uuidSchema.nullable().optional(),
  content: trimmed(LIMITS.reply).min(1),
  /** Display hint only (shows the "Author" badge on the optimistic row). */
  isPostAuthor: z.boolean().optional(),
});

export const editReplySchema = z.object({
  replyId: uuidSchema,
  content: trimmed(LIMITS.reply).min(1),
});

// ---- Journal ---------------------------------------------------------------------

export const journalSchema = z
  .object({
    id: uuidSchema.optional(),
    title: optionalText(LIMITS.journalTitle),
    content: z.string().max(LIMITS.journalContent),
    isDraft: z.boolean(),
  })
  .refine((v) => v.isDraft || v.content.trim().length > 0, { path: ["content"], message: "required" });

// ---- Listening -------------------------------------------------------------------

export const listeningPreferencesSchema = z.object({
  available: z.boolean(),
  languages: z.array(contentLanguageSchema).min(1).max(3),
  topics: z.array(topicSchema).max(TOPICS.length),
  note: optionalText(LIMITS.listenerNote),
});

export const sessionRequestSchema = z.object({
  language: contentLanguageSchema,
  topic: topicSchema.nullable().optional(),
  intro: optionalText(LIMITS.intro),
  listenerHandle: handleSchema.optional(),
});

export const messageSchema = z.object({
  sessionId: uuidSchema,
  content: trimmed(LIMITS.message).min(1),
});

// ---- Safety ----------------------------------------------------------------------

export const reportSchema = z
  .object({
    targetType: z.enum(REPORT_TARGETS),
    targetId: uuidSchema.optional(),
    targetHandle: handleSchema.optional(),
    reason: z.enum(REPORT_REASONS),
    details: optionalText(LIMITS.reportDetails),
  })
  .refine((v) => (v.targetType === "user" ? Boolean(v.targetHandle) : Boolean(v.targetId)), {
    message: "target required",
  });

export const moderationContentSchema = z.object({
  targetType: z.enum(["post", "reply"]),
  targetId: uuidSchema,
  status: z.enum(["active", "hidden", "removed"]),
  reason: optionalText(LIMITS.moderationNote),
});

export const moderationReportSchema = z.object({
  reportId: uuidSchema,
  status: z.enum(["reviewing", "resolved", "dismissed"]),
  note: optionalText(LIMITS.moderationNote),
});

export const suspendSchema = z.object({
  handle: handleSchema,
  days: z.number().int().min(0).max(3650),
  reason: optionalText(LIMITS.moderationNote),
});

// ---- Administration (Super Admin RPCs re-check the role in SQL) ----------------

export const adminRoleSchema = z.object({
  handle: handleSchema,
  role: z.enum(ROLES),
  reason: optionalText(LIMITS.moderationNote),
});

export const adminVerificationSchema = z.object({
  handle: handleSchema,
  verified: z.boolean(),
  reason: optionalText(500),
});

export const removeAvatarSchema = z.object({
  handle: handleSchema,
  reason: optionalText(LIMITS.moderationNote),
});

export const boostPostSchema = z.object({
  postId: uuidSchema,
  /** 0 removes the boost. */
  hours: z.number().int().min(0).max(PROMOTION.maxBoostHours),
  reason: optionalText(LIMITS.moderationNote),
});

export const bonusLikesSchema = z.object({
  postId: uuidSchema,
  count: z.number().int().min(0).max(PROMOTION.maxBonusLikes),
  reason: optionalText(LIMITS.moderationNote),
});

const base64Url = (min: number, max: number) => z.string().regex(new RegExp(`^[A-Za-z0-9_-]{${min},${max}}={0,2}$`));

/** PushSubscription.toJSON() from the browser. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(1024),
  keys: z.object({ p256dh: base64Url(80, 100), auth: base64Url(16, 30) }),
});

export type TextPostInput = z.input<typeof textPostSchema>;
export type VoicePostInput = z.input<typeof voicePostSchema>;
