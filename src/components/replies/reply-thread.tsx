"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CornerDownRight, Flag, MessageCircle, MoreHorizontal, Pencil, Trash2, UserX } from "lucide-react";
import { toast } from "sonner";
import { createReplyAction, deleteReplyAction, editReplyAction, loadRepliesAction } from "@/app/actions/community";
import { LIMITS } from "@/lib/constants";
import { errorMessage } from "@/lib/errors";
import { useI18n } from "@/lib/i18n/client";
import type { PostCursor, ReplyRow } from "@/lib/types";
import { cn, interpolate } from "@/lib/utils";
import { Avatar } from "@/components/brand";
import { UserName } from "@/components/user-name";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form-controls";
import { Badge, EmptyState } from "@/components/ui/misc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BlockDialog, ConfirmDialog, ReportDialog } from "@/components/safety/safety-dialogs";
import { ReactionBar } from "@/components/posts/reaction-bar";

type Props = {
  postId: string;
  viewerIsAuthor: boolean;
  initialReplies: ReplyRow[];
  initialCursor: PostCursor | null;
};

export function ReplyThread({ postId, viewerIsAuthor, initialReplies, initialCursor }: Props) {
  const { t } = useI18n();
  const [replies, setReplies] = useState(initialReplies);
  const [cursor, setCursor] = useState(initialCursor);
  const [replyingTo, setReplyingTo] = useState<ReplyRow | null>(null);
  const [loading, startLoading] = useTransition();

  // Group into top-level replies with their (single-level) children. Children
  // whose parent is unavailable are shown at the top level with a note.
  const tree = useMemo(() => {
    const ids = new Set(replies.map((r) => r.id));
    const children = new Map<string, ReplyRow[]>();
    const roots: { reply: ReplyRow; orphan: boolean }[] = [];
    for (const reply of replies) {
      if (reply.parent_reply_id && ids.has(reply.parent_reply_id)) {
        const list = children.get(reply.parent_reply_id) ?? [];
        list.push(reply);
        children.set(reply.parent_reply_id, list);
      } else {
        roots.push({ reply, orphan: Boolean(reply.parent_reply_id) });
      }
    }
    return { roots, children };
  }, [replies]);

  function loadMore() {
    if (!cursor) return;
    startLoading(async () => {
      const result = await loadRepliesAction({ postId, cursor });
      if (result.ok) {
        setReplies((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          return [...prev, ...result.data.replies.filter((r) => !seen.has(r.id))];
        });
        setCursor(result.data.nextCursor);
      } else toast.error(errorMessage(t, result.error));
    });
  }

  const added = (reply: ReplyRow) => {
    setReplies((prev) => [...prev, reply]);
    setReplyingTo(null);
  };
  const updated = (id: string, patch: Partial<ReplyRow>) => setReplies((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removed = (filter: { id?: string; handle?: string }) =>
    setReplies((prev) => prev.filter((r) => (filter.id ? r.id !== filter.id : r.author_handle !== filter.handle)));

  return (
    <section aria-labelledby="replies-title" className="mt-8">
      <h2 id="replies-title" className="text-lg font-semibold">
        {t.replies.title}
      </h2>

      <div className="mt-4">
        <ReplyComposer postId={postId} viewerIsAuthor={viewerIsAuthor} onCreated={added} />
      </div>

      {replies.length === 0 ? (
        <EmptyState icon={MessageCircle} title={t.replies.empty} className="py-10" />
      ) : (
        <ol className="mt-6 space-y-4">
          {tree.roots.map(({ reply, orphan }) => (
            <li key={reply.id}>
              <ReplyItem reply={reply} orphan={orphan} onUpdated={updated} onRemoved={removed} onReply={() => setReplyingTo(reply)} canReply={!reply.parent_reply_id} />
              {(tree.children.get(reply.id)?.length || replyingTo?.id === reply.id) ? (
                <ol className="mt-3 space-y-3 border-l-2 border-primary-soft pl-4 sm:ml-5">
                  {tree.children.get(reply.id)?.map((child) => (
                    <li key={child.id}>
                      <ReplyItem reply={child} onUpdated={updated} onRemoved={removed} canReply={false} />
                    </li>
                  ))}
                  {replyingTo?.id === reply.id ? (
                    <li>
                      <ReplyComposer
                        postId={postId}
                        parent={reply}
                        viewerIsAuthor={viewerIsAuthor}
                        onCreated={added}
                        onCancel={() => setReplyingTo(null)}
                        autoFocus
                      />
                    </li>
                  ) : null}
                </ol>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {cursor ? (
        <div className="mt-6 text-center">
          <Button variant="outline" onClick={loadMore} loading={loading}>
            {t.replies.loadMore}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function ReplyComposer({
  postId,
  parent,
  viewerIsAuthor,
  onCreated,
  onCancel,
  autoFocus,
}: {
  postId: string;
  parent?: ReplyRow;
  viewerIsAuthor: boolean;
  onCreated: (reply: ReplyRow) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const { t } = useI18n();
  const [content, setContent] = useState("");
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const id = parent ? `reply-to-${parent.id}` : "reply-new";

  function insertPrompt(prompt: string) {
    setContent((current) => (current.trim() ? `${current.trimEnd()} ${prompt}` : prompt));
    ref.current?.focus();
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = content.trim();
    if (!value) return;
    startTransition(async () => {
      const result = await createReplyAction({ postId, parentReplyId: parent?.id ?? null, content: value, isPostAuthor: viewerIsAuthor });
      if (result.ok) {
        setContent("");
        onCreated(result.data);
      } else toast.error(errorMessage(t, result.error));
    });
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border border-border bg-surface p-4">
      {parent ? (
        <p className="mb-2 text-xs text-muted-foreground">{interpolate(t.replies.replyingTo, { name: parent.author_display_name })}</p>
      ) : (
        <div className="mb-3">
          <p className="text-xs text-muted-foreground">{t.replies.promptsLabel}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {t.replies.prompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => insertPrompt(prompt)}
                className="rounded-full border border-border bg-primary-faint/60 px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:border-primary/40"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}
      <label htmlFor={id} className="sr-only">
        {t.replies.label}
      </label>
      <Textarea
        ref={ref}
        id={id}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={t.replies.placeholder}
        maxLength={LIMITS.reply}
        className="min-h-20 border-0 bg-transparent px-0 focus-visible:outline-none"
        autoFocus={autoFocus}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{t.replies.respectfulNote}</p>
        <div className="flex shrink-0 gap-2">
          {onCancel ? (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              {t.common.cancel}
            </Button>
          ) : null}
          <Button type="submit" size="sm" disabled={!content.trim()} loading={pending}>
            {pending ? t.replies.posting : t.replies.post}
          </Button>
        </div>
      </div>
    </form>
  );
}

function ReplyItem({
  reply,
  orphan,
  canReply,
  onReply,
  onUpdated,
  onRemoved,
}: {
  reply: ReplyRow;
  orphan?: boolean;
  canReply: boolean;
  onReply?: () => void;
  onUpdated: (id: string, patch: Partial<ReplyRow>) => void;
  onRemoved: (filter: { id?: string; handle?: string }) => void;
}) {
  const { t, relative } = useI18n();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(reply.content);
  const [dialog, setDialog] = useState<"report" | "block" | "delete" | null>(null);
  const [pending, startTransition] = useTransition();
  const active = reply.status === "active";

  function save() {
    const value = draft.trim();
    if (!value) return;
    startTransition(async () => {
      const result = await editReplyAction({ replyId: reply.id, content: value });
      if (result.ok) {
        onUpdated(reply.id, { content: value, edited_at: new Date().toISOString() });
        setEditing(false);
      } else toast.error(errorMessage(t, result.error));
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteReplyAction(reply.id);
      if (result.ok) {
        toast.success(t.replies.deleted);
        setDialog(null);
        onRemoved({ id: reply.id });
      } else toast.error(errorMessage(t, result.error));
    });
  }

  return (
    <article className={cn("rounded-2xl bg-background-secondary p-4", !active && "opacity-80")}>
      {orphan ? (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CornerDownRight className="size-3.5" aria-hidden /> {t.replies.inReplyToRemoved}
        </p>
      ) : null}
      <header className="flex items-start gap-3">
        <Link href={`/profile/${reply.author_handle}`} tabIndex={-1} aria-hidden>
          <Avatar avatarKey={reply.author_avatar_key} avatarPath={reply.author_avatar_path} name={reply.author_display_name} size="sm" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-sm">
            <UserName
              name={reply.author_display_name}
              verified={reply.author_verified}
              href={`/profile/${reply.author_handle}`}
              nameClassName="font-medium"
            />
            {reply.is_post_author ? <Badge tone="green">{t.replies.authorBadge}</Badge> : null}
            <span className="text-xs text-muted-foreground">
              <time dateTime={reply.created_at}>{relative(reply.created_at)}</time>
              {reply.edited_at ? ` · ${t.common.edited}` : ""}
            </span>
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t.common.more}
            className="-mr-1 -mt-1 inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {reply.is_mine ? (
              <>
                {active ? (
                  <DropdownMenuItem onSelect={() => setEditing(true)}>
                    <Pencil aria-hidden /> {t.replies.edit}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem destructive onSelect={() => setDialog("delete")}>
                  <Trash2 aria-hidden /> {t.replies.delete}
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem onSelect={() => setDialog("report")}>
                  <Flag aria-hidden /> {t.replies.report}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => setDialog("block")}>
                  <UserX aria-hidden /> {interpolate(t.post.blockAuthor, { name: reply.author_display_name })}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {!active ? <p className="mt-2 text-xs text-muted-foreground">{t.replies.hiddenNotice}</p> : null}

      {editing ? (
        <div className="mt-3">
          <label htmlFor={`edit-${reply.id}`} className="sr-only">
            {t.replies.edit}
          </label>
          <Textarea id={`edit-${reply.id}`} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={LIMITS.reply} autoFocus />
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(false); setDraft(reply.content); }}>
              {t.common.cancel}
            </Button>
            <Button type="button" size="sm" onClick={save} loading={pending}>
              {t.common.save}
            </Button>
          </div>
        </div>
      ) : (
        <p className="prose-nafis mt-2 text-[0.95rem]">{reply.content}</p>
      )}

      {active ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ReactionBar targetType="reply" targetId={reply.id} initialCounts={reply.reactions} initialMine={reply.my_reaction} compact />
          {canReply && onReply ? (
            <button
              type="button"
              onClick={onReply}
              className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <CornerDownRight className="size-3.5" aria-hidden /> {t.replies.replyTo}
            </button>
          ) : null}
        </div>
      ) : null}

      <ReportDialog open={dialog === "report"} onOpenChange={(o) => setDialog(o ? "report" : null)} target={{ type: "reply", id: reply.id }} title={t.replies.report} />
      <BlockDialog
        open={dialog === "block"}
        onOpenChange={(o) => setDialog(o ? "block" : null)}
        handle={reply.author_handle}
        name={reply.author_display_name}
        onBlocked={() => {
          onRemoved({ handle: reply.author_handle });
          router.refresh();
        }}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(o) => setDialog(o ? "delete" : null)}
        title={t.replies.deleteTitle}
        body={t.replies.deleteBody}
        confirmLabel={t.common.delete}
        onConfirm={remove}
        pending={pending}
      />
    </article>
  );
}
