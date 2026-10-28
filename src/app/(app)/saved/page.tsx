import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { getPosts } from "@/lib/data";
import { getI18n } from "@/lib/i18n/server";
import { PostList } from "@/components/posts/post-list";
import { PageHeader } from "@/components/ui/misc";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.saved.title };
}

export default async function SavedPage() {
  const [, { t }] = await Promise.all([requireProfile(), getI18n()]);
  const filters = { bookmarked: true };
  const { posts, nextCursor } = await getPosts(filters);

  return (
    <>
      <PageHeader title={t.saved.title} subtitle={t.saved.subtitle} />
      <PostList
        initialPosts={posts}
        initialCursor={nextCursor}
        filters={filters}
        empty={{ icon: "bookmark", title: t.saved.empty, body: t.saved.emptyBody }}
      />
    </>
  );
}
