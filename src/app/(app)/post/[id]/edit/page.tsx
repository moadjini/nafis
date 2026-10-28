import type { Metadata } from "next";
import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getPost } from "@/lib/data";
import { getI18n } from "@/lib/i18n/server";
import { isUuid } from "@/lib/utils";
import { EditPostForm } from "@/components/composer/edit-post-form";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.composer.editTitle };
}

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { t }] = await Promise.all([params, getI18n()]);
  await requireProfile(`/post/${id}/edit`);
  const post = isUuid(id) ? await getPost(id) : null;

  // Only the author may edit, and moderated posts are locked (also enforced in SQL).
  if (!post || !post.is_mine || post.status !== "active") {
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

  return (
    <>
      <PageHeader title={t.composer.editTitle} subtitle={t.composer.subtitle} />
      <EditPostForm post={post} />
    </>
  );
}
