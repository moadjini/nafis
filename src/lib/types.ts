import type {
  AvatarKey,
  ContentLanguage,
  FeedSort,
  Locale,
  ReactionKey,
  ResponsePreference,
  AuditAction,
  Role,
  StaffRole,
  Theme,
  Topic,
} from "@/lib/constants";

export type ReactionCounts = Partial<Record<ReactionKey, number>>;

export type Profile = {
  id: string;
  handle: string;
  display_name: string;
  avatar_key: AvatarKey;
  avatar_path: string | null;
  bio: string | null;
  preferred_language: Locale;
  theme: Theme;
  hidden_topics: Topic[];
  onboarding_completed: boolean;
  created_at: string;
};

export type ViewerProfile = Profile & {
  role: StaffRole | null;
  is_verified: boolean;
  suspended_until: string | null;
};

/** Row shape returned by public.get_posts (never includes author ids). */
export type PostRow = {
  id: string;
  post_type: "text" | "voice";
  content: string | null;
  caption: string | null;
  audio_duration_seconds: number | null;
  language: ContentLanguage;
  topic: Topic | null;
  response_preference: ResponsePreference;
  visibility: "community" | "draft";
  status: "active" | "hidden" | "removed";
  created_at: string;
  published_at: string | null;
  edited_at: string | null;
  sort_at: string;
  author_handle: string;
  author_display_name: string;
  author_avatar_key: AvatarKey;
  author_avatar_path: string | null;
  author_verified: boolean;
  is_mine: boolean;
  reply_count: number;
  reactions: ReactionCounts;
  my_reaction: ReactionKey | null;
  is_bookmarked: boolean;
  is_muted: boolean;
  /** Present only for Super Admins. */
  promotion: PostPromotion | null;
};

export type PostPromotion = { boosted_until: string | null; bonus_likes: number };

export type PromotionRow = {
  post_id: string;
  post_type: "text" | "voice";
  excerpt: string;
  status: "active" | "hidden" | "removed";
  published_at: string | null;
  author_handle: string;
  author_display_name: string;
  boosted_until: string | null;
  boosted_by_handle: string | null;
  bonus_likes: number;
  real_reactions: number;
  reply_count: number;
};

export type ReplyRow = {
  id: string;
  parent_reply_id: string | null;
  content: string;
  status: "active" | "hidden" | "removed";
  created_at: string;
  edited_at: string | null;
  author_handle: string;
  author_display_name: string;
  author_avatar_key: AvatarKey;
  author_avatar_path: string | null;
  author_verified: boolean;
  is_mine: boolean;
  is_post_author: boolean;
  reactions: ReactionCounts;
  my_reaction: ReactionKey | null;
};

export type ReactionState = { reactions: ReactionCounts; my_reaction: ReactionKey | null };

export type PublicProfile = {
  handle: string;
  display_name: string;
  avatar_key: AvatarKey;
  avatar_path: string | null;
  is_verified: boolean;
  bio: string | null;
  member_since: string;
  is_me: boolean;
  is_blocked_by_me: boolean;
  listening_available: boolean;
  listening_languages: ContentLanguage[] | null;
  listening_topics: Topic[] | null;
  listening_note: string | null;
};

export type ListenerRow = {
  handle: string;
  display_name: string;
  avatar_key: AvatarKey;
  avatar_path: string | null;
  is_verified: boolean;
  languages: ContentLanguage[];
  topics: Topic[];
  note: string | null;
};

export type OpenRequestRow = {
  id: string;
  language: ContentLanguage;
  topic: Topic | null;
  intro: string | null;
  created_at: string;
  requester_handle: string;
  requester_display_name: string;
  requester_avatar_key: AvatarKey;
  requester_avatar_path: string | null;
  requester_verified: boolean;
};

export type SessionStatus = "requested" | "accepted" | "active" | "completed" | "cancelled";
export type SessionEndReason = "declined" | "withdrawn" | "ended" | "blocked" | "expired" | "moderation";

export type SessionRow = {
  id: string;
  status: SessionStatus;
  end_reason: SessionEndReason | null;
  my_role: "requester" | "listener";
  is_open_request: boolean;
  counterpart_handle: string | null;
  counterpart_display_name: string | null;
  counterpart_avatar_key: AvatarKey | null;
  counterpart_avatar_path: string | null;
  counterpart_verified: boolean;
  language: ContentLanguage;
  topic: Topic | null;
  intro: string | null;
  created_at: string;
  accepted_at: string | null;
  ended_at: string | null;
  ended_by_me: boolean;
  last_message_at: string | null;
  is_expired: boolean;
};

export type MessageRow = {
  id: string;
  session_id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

export type NotificationType =
  | "post_reply"
  | "reply_reply"
  | "reaction_summary"
  | "session_request"
  | "session_accepted"
  | "session_declined"
  | "session_cancelled"
  | "session_ended"
  | "session_message"
  | "moderation_notice"
  | "account_update";

export type NotificationRow = {
  id: string;
  type: NotificationType;
  read_at: string | null;
  created_at: string;
  actor_display_name: string | null;
  actor_handle: string | null;
  related_post_id: string | null;
  related_reply_id: string | null;
  related_session_id: string | null;
  data: {
    count?: number;
    target_type?: string;
    status?: string;
    days?: number;
    kind?: "role" | "verified" | "unverified";
    role?: Role;
  };
};

export type JournalEntry = {
  id: string;
  title: string | null;
  content: string;
  is_draft: boolean;
  created_at: string;
  updated_at: string;
};

export type BlockedUser = {
  handle: string;
  display_name: string;
  avatar_key: AvatarKey;
  avatar_path: string | null;
  is_verified: boolean;
  blocked_at: string;
};

export type ListeningPreferences = {
  available: boolean;
  languages: ContentLanguage[];
  topics: Topic[];
  note: string | null;
};

export type NotificationPreferences = {
  replies: boolean;
  reaction_summaries: boolean;
  sessions: boolean;
  email_enabled: boolean;
};

export type ModReportRow = {
  id: string;
  target_type: "post" | "reply" | "user" | "session" | "message";
  target_id: string;
  reason: string;
  details: string | null;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  created_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  open_reports_on_target: number;
  target_excerpt: string | null;
  target_status: "active" | "hidden" | "removed" | null;
  target_author_handle: string | null;
  target_post_id: string | null;
  target_is_voice: boolean;
};

export type AuditLogRow = {
  id: string;
  actor_handle: string | null;
  actor_display_name: string | null;
  action: AuditAction;
  target_type: string;
  target_id: string;
  affected_handle: string | null;
  affected_display_name: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  total_count: number;
};

export type AdminUserRow = {
  handle: string;
  display_name: string;
  avatar_key: AvatarKey;
  avatar_path: string | null;
  role: Role;
  is_verified: boolean;
  verified_at: string | null;
  created_at: string;
  onboarding_completed: boolean;
  suspended_until: string | null;
  post_count: number;
  open_reports: number;
  total_count: number;
};

export type AdminUserDetail = {
  handle: string;
  display_name: string;
  avatar_key: AvatarKey;
  avatar_path: string | null;
  bio: string | null;
  preferred_language: Locale;
  onboarding_completed: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  role: Role;
  role_granted_at: string | null;
  role_granted_by: string | null;
  role_reason: string | null;
  is_verified: boolean;
  verified_at: string | null;
  verified_by: string | null;
  verification_reason: string | null;
  suspended_until: string | null;
  suspension_reason: string | null;
  counts: {
    posts: number;
    replies: number;
    reports_open: number;
    reports_total: number;
    reports_filed: number;
    hidden_or_removed: number;
  };
  history: {
    action: AuditAction;
    target_type: string;
    reason: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    actor_handle: string | null;
  }[];
};

export type AdminOverview = {
  days: number;
  total_users: number;
  onboarded_users: number;
  new_users: number;
  signed_in_users: number;
  active_contributors: number;
  total_posts: number;
  new_posts: number;
  total_replies: number;
  new_replies: number;
  pending_reports: number;
  open_cases: number;
  verified_users: number;
  moderators: number;
  super_admins: number;
  suspended_users: number;
  open_sessions: number;
};

export type ActivityPoint = { day: string; registrations: number; posts: number; replies: number; contributors: number };

export type RestrictionRow = {
  handle: string;
  display_name: string;
  avatar_key: AvatarKey;
  avatar_path: string | null;
  role: Role;
  suspended_until: string;
  reason: string | null;
  created_at: string;
  created_by_handle: string | null;
};

export type PostCursor = { at: string; id: string };

/** Ranked ("top") feeds page by offset against the time the first page loaded. */
export type RankedCursor = { rankedAt: string; offset: number };
export type FeedCursor = PostCursor | RankedCursor;

export type FeedFilters = {
  postType?: "text" | "voice";
  topic?: Topic;
  language?: ContentLanguage;
  seeking?: boolean;
  authorHandle?: string;
  bookmarked?: boolean;
  /** Exclude "just expressing" posts (Listening space). */
  inviting?: boolean;
  /** "top" ranks by engagement (boosted posts first); default is newest first. */
  sort?: FeedSort;
};
