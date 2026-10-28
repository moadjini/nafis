import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getPost, getReplies } from "@/lib/data";
import { getI18n } from "@/lib/i18n/server";
import { isUuid } from "@/lib/utils";
import { PostCard } from "@/components/posts/post-card";
import { ResponsePreferenceGuidance } from "@/components/composer/post-meta-fields";
import { ReplyThread } from "@/components/replies/reply-thread";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  // Never put post content in the title (it shows in history and tab previews).
  return { title: t.post.viewConversation };
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { t }] = await Promise.all([params, getI18n()]);
  await requireProfile(`/post/${id}`);

  const post = isUuid(id) ? await getPost(id) : null;

  if (!post) {
    return (
      <EmptyState
        icon={FileQuestion}
        title={t.post.notFoundTitle}
        body={t.post.notFoundBody}
        action={
          <Button asChild variant="secondary">
            <Link href="/home">{t.post.backToFeed}</Link>
          </Button>
        }
      />
    );
  }

  const open = post.visibility === "community" && post.status === "active";
  const { replies, nextCursor } = open ? await getReplies(post.id) : { replies: [], nextCursor: null };

  return (
    <>
      <Link href="/home" className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary-text">
        <ArrowLeft className="size-4" aria-hidden /> {t.post.backToFeed}
      </Link>
      <PostCard post={post} variant="detail" />
      {open ? (
        <>
          <div className="mt-6">
            <ResponsePreferenceGuidance preference={post.response_preference} />
          </div>
          <ReplyThread postId={post.id} viewerIsAuthor={post.is_mine} initialReplies={replies} initialCursor={nextCursor} />
        </>
      ) : null}
    </>
  );
}
