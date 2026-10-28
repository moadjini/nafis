"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  BellOff,
  Bookmark,
  BookmarkCheck,
  Flag,
  HeartHandshake,
  HeartPlus,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Rocket,
  ShieldAlert,
  Trash2,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { deletePostAction, setBookmarkAction, setThreadMutedAction } from "@/app/actions/posts";
import { errorMessage } from "@/lib/errors";
import { useI18n } from "@/lib/i18n/client";
import type { PostRow } from "@/lib/types";
import { cn, interpolate } from "@/lib/utils";
import { Avatar } from "@/components/brand";
import { UserName } from "@/components/user-name";
import { Badge, Notice } from "@/components/ui/misc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BlockDialog, ConfirmDialog, ReportDialog } from "@/components/safety/safety-dialogs";
import { useViewer } from "@/components/app-shell/viewer-context";
import { AudioPlayer } from "./audio-player";
import { PromotePostDialog } from "./promote-post-dialog";
import { ReactionBar } from "./reaction-bar";

const CLAMP_AT = 420;

export function PostCard({
  post,
  variant = "feed",
  onRemove,
}: {
  post: PostRow;
  variant?: "feed" | "detail";
  /** Called after delete/block so lists can drop the card. */
  onRemove?: (filter: { postId?: string; authorHandle?: string }) => void;
}) {
  const { t, relative } = useI18n();
  const router = useRouter();
  const [bookmarked, setBookmarked] = useState(post.is_bookmarked);
  const [muted, setMuted] = useState(post.is_muted);
  const [expanded, setExpanded] = useState(variant === "detail");
  const [dialog, setDialog] = useState<"report" | "block" | "delete" | "boost" | "likes" | null>(null);
  const viewer = useViewer();
  const [pending, startTransition] = useTransition();

  const isDraft = post.visibility === "draft";
  const moderated = post.status !== "active";
  const interactive = !isDraft && !moderated;
  // Promotion data is only sent to Super Admins; the database re-checks the role.
  const promotion = viewer?.isSuperAdmin && interactive ? post.promotion : null;
  const promoteItems = promotion ? (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => setDialog("boost")}>
        <Rocket aria-hidden /> {t.promote.boost}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => setDialog("likes")}>
        <HeartPlus aria-hidden /> {t.promote.likes}
      </DropdownMenuItem>
    </>
  ) : null;
  const href = `/post/${post.id}`;
  const content = post.content ?? "";
  const long = content.length > CLAMP_AT;
  const shown = expanded || !long ? content : `${content.slice(0, CLAMP_AT).trimEnd()}…`;
  const headingId = `post-${post.id}-author`;

  function toggleBookmark() {
    const next = !bookmarked;
    setBookmarked(next);
    startTransition(async () => {
      const result = await setBookmarkAction(post.id, next);
      if (result.ok) toast.success(next ? t.post.savedToast : t.post.unsavedToast);
      else {
        setBookmarked(!next);
        toast.error(errorMessage(t, result.error));
      }
    });
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    startTransition(async () => {
      const result = await setThreadMutedAction(post.id, next);
      if (result.ok) toast.success(next ? t.post.muted : t.post.unmuted);
      else {
        setMuted(!next);
        toast.error(errorMessage(t, result.error));
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deletePostAction(post.id);
      if (result.ok) {
        toast.success(t.post.deleted);
        setDialog(null);
        if (onRemove) onRemove({ postId: post.id });
        else router.push("/home");
      } else toast.error(errorMessage(t, result.error));
    });
  }

  const replyLabel =
    post.reply_count === 0 ? t.post.noReplies : post.reply_count === 1 ? t.post.oneReply : interpolate(t.post.replies, { count: post.reply_count });

  return (
    <article
      aria-labelledby={headingId}
      className={cn("rounded-3xl border border-border bg-surface p-5 transition-colors sm:p-6", variant === "detail" ? "shadow-soft" : "hover:border-primary/25")}
    >
      <header className="flex items-start gap-3">
        <Link href={`/profile/${post.author_handle}`} tabIndex={-1} aria-hidden>
          <Avatar avatarKey={post.author_avatar_key} avatarPath={post.author_avatar_path} name={post.author_display_name} />
        </Link>
        <div className="min-w-0 flex-1">
          <p id={headingId} className="flex flex-wrap items-center gap-x-2 text-sm">
            <UserName
              name={post.author_display_name}
              verified={post.author_verified}
              href={`/profile/${post.author_handle}`}
              nameClassName="font-medium text-foreground"
            />
            {isDraft ? <Badge tone="warning">{t.post.draft}</Badge> : null}
            {promotion?.boosted_until ? <Badge tone="green">{t.promote.badge}</Badge> : null}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <time dateTime={post.published_at ?? post.created_at}>{relative(post.published_at ?? post.created_at)}</time>
            {post.edited_at ? <span>· {t.common.edited}</span> : null}
            {post.topic ? (
              <>
                <span aria-hidden>·</span>
                <Link href={`/explore?topic=${post.topic}`} className="hover:text-primary-text">
                  {t.topics[post.topic]}
                </Link>
              </>
            ) : null}
            {post.language !== "en" ? (
              <>
                <span aria-hidden>·</span>
                <span>{t.languages[post.language]}</span>
              </>
            ) : null}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t.common.more}
            className="-mr-2 -mt-1 inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <MoreHorizontal className="size-5" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {post.is_mine ? (
              <>
                {!moderated ? (
                  <DropdownMenuItem asChild>
                    <Link href={`/post/${post.id}/edit`}>
                      <Pencil aria-hidden /> {t.post.edit}
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                {!isDraft ? (
                  <DropdownMenuItem onSelect={toggleMute}>
                    {muted ? <Bell aria-hidden /> : <BellOff aria-hidden />} {muted ? t.post.unmute : t.post.mute}
                  </DropdownMenuItem>
                ) : null}
                {promoteItems}
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => setDialog("delete")}>
                  <Trash2 aria-hidden /> {t.post.delete}
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem onSelect={toggleBookmark}>
                  {bookmarked ? <BookmarkCheck aria-hidden /> : <Bookmark aria-hidden />} {bookmarked ? t.post.unsave : t.post.save}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={toggleMute}>
                  {muted ? <Bell aria-hidden /> : <BellOff aria-hidden />} {muted ? t.post.unmute : t.post.mute}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setDialog("report")}>
                  <Flag aria-hidden /> {t.post.report}
                </DropdownMenuItem>
                <DropdownMenuItem destructive onSelect={() => setDialog("block")}>
                  <UserX aria-hidden /> {interpolate(t.post.blockAuthor, { name: post.author_display_name })}
                </DropdownMenuItem>
                {promoteItems}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {moderated && post.is_mine ? (
        <Notice icon={ShieldAlert} tone="neutral" className="mt-4">
          {post.status === "hidden" ? t.post.hiddenNotice : t.post.removedNotice}
        </Notice>
      ) : null}

      <div className="mt-4">
        {post.caption ? (
          <p className={cn("font-medium text-foreground", post.post_type === "text" ? "mb-2 text-[1.05rem]" : "mb-3")}>{post.caption}</p>
        ) : null}

        {post.post_type === "voice" ? (
          <AudioPlayer
            postId={post.id}
            durationSeconds={post.audio_duration_seconds ?? 0}
            label={`${t.post.voicePost} — ${post.author_display_name}`}
          />
        ) : (
          <div className="prose-nafis text-[0.975rem] text-foreground">
            {shown}
            {long ? (
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="ml-1 font-medium text-primary-text hover:underline"
                aria-expanded={expanded}
              >
                {expanded ? t.post.showLess : t.post.readMore}
              </button>
            ) : null}
          </div>
        )}
      </div>

      <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary-faint px-3 py-1 text-xs text-primary-text">
        <HeartHandshake className="size-3.5" aria-hidden />
        {t.responsePrefs[post.response_preference].short}
      </p>

      {interactive ? (
        <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <ReactionBar
            targetType="post"
            targetId={post.id}
            initialCounts={post.reactions}
            initialMine={post.my_reaction}
          />
          <div className="flex items-center gap-1">
            {variant === "feed" ? (
              <Link
                href={href}
                className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <MessageCircle className="size-[1.1rem]" aria-hidden />
                <span>{replyLabel}</span>
              </Link>
            ) : null}
            {!post.is_mine ? (
              <button
                type="button"
                onClick={toggleBookmark}
                disabled={pending}
                aria-pressed={bookmarked}
                aria-label={bookmarked ? t.post.unsave : t.post.save}
                className={cn(
                  "inline-flex size-9 items-center justify-center rounded-full transition-colors hover:bg-muted",
                  bookmarked ? "text-primary-text" : "text-muted-foreground",
                )}
              >
                {bookmarked ? <BookmarkCheck className="size-[1.1rem]" aria-hidden /> : <Bookmark className="size-[1.1rem]" aria-hidden />}
              </button>
            ) : null}
          </div>
        </footer>
      ) : isDraft && post.is_mine ? (
        <footer className="mt-4 flex gap-2 border-t border-border pt-3">
          <Link href={`/post/${post.id}/edit`} className="text-sm font-medium text-primary-text hover:underline">
            {t.post.edit} · {t.post.publishDraft}
          </Link>
        </footer>
      ) : null}

      <ReportDialog open={dialog === "report"} onOpenChange={(o) => setDialog(o ? "report" : null)} target={{ type: "post", id: post.id }} title={t.post.report} />
      <BlockDialog
        open={dialog === "block"}
        onOpenChange={(o) => setDialog(o ? "block" : null)}
        handle={post.author_handle}
        name={post.author_display_name}
        onBlocked={() => {
          if (onRemove) onRemove({ authorHandle: post.author_handle });
          else router.push("/home");
        }}
      />
      {promotion && (dialog === "boost" || dialog === "likes") ? (
        <PromotePostDialog postId={post.id} promotion={promotion} mode={dialog} onClose={() => setDialog(null)} />
      ) : null}
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(o) => setDialog(o ? "delete" : null)}
        title={t.post.deleteTitle}
        body={t.post.deleteBody}
        confirmLabel={t.common.delete}
        onConfirm={remove}
        pending={pending}
      />
    </article>
  );
}
