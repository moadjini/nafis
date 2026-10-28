"use client";

import { useState, useTransition } from "react";
import { Bookmark, FileText, Leaf, RefreshCw } from "lucide-react";
import { loadPostsAction } from "@/app/actions/posts";
import { errorMessage, type ErrorCode } from "@/lib/errors";
import { useI18n } from "@/lib/i18n/client";
import type { FeedCursor, FeedFilters, PostRow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { PostCard } from "./post-card";

const EMPTY_ICONS = { leaf: Leaf, bookmark: Bookmark, file: FileText } as const;

/**
 * Feed list with "Show more" pagination (keyset, or offset for ranked feeds;
 * duplicates are dropped either way). Filters are applied
 * server-side by public.get_posts (visibility, moderation, blocks, hidden topics).
 */
export function PostList({
  initialPosts,
  initialCursor,
  filters,
  empty,
}: {
  initialPosts: PostRow[];
  initialCursor: FeedCursor | null;
  filters: FeedFilters;
  /** Icons are referenced by name: components cannot be passed from Server Components. */
  empty: { icon?: keyof typeof EMPTY_ICONS; title: string; body?: string; action?: React.ReactNode };
}) {
  const { t } = useI18n();
  const [posts, setPosts] = useState(initialPosts);
  const [cursor, setCursor] = useState(initialCursor);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [pending, startTransition] = useTransition();

  // Reset when the server sends a new first page (filters changed / refresh).
  const [sourcePosts, setSourcePosts] = useState(initialPosts);
  if (sourcePosts !== initialPosts) {
    setSourcePosts(initialPosts);
    setPosts(initialPosts);
    setCursor(initialCursor);
    setError(null);
  }

  function loadMore() {
    if (!cursor) return;
    setError(null);
    startTransition(async () => {
      const result = await loadPostsAction({ ...filters, cursor });
      if (result.ok) {
        setPosts((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...result.data.posts.filter((p) => !seen.has(p.id))];
        });
        setCursor(result.data.nextCursor);
      } else {
        setError(result.error);
      }
    });
  }

  function handleRemove({ postId, authorHandle }: { postId?: string; authorHandle?: string }) {
    setPosts((prev) => prev.filter((p) => (postId ? p.id !== postId : p.author_handle !== authorHandle)));
  }

  if (posts.length === 0) {
    return <EmptyState icon={EMPTY_ICONS[empty.icon ?? "leaf"]} title={empty.title} body={empty.body} action={empty.action} />;
  }

  return (
    <div>
      <ul className="space-y-4">
        {posts.map((post) => (
          <li key={post.id}>
            <PostCard post={post} onRemove={handleRemove} />
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-col items-center gap-3" aria-live="polite">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(t, error)}
          </p>
        ) : null}
        {cursor ? (
          <Button variant="outline" onClick={loadMore} loading={pending}>
            {error ? <RefreshCw aria-hidden /> : null}
            {error ? t.common.retry : t.common.loadMore}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">{t.feed.end}</p>
        )}
      </div>
    </div>
  );
}
