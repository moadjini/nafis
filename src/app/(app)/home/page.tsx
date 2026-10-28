import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { getPosts } from "@/lib/data";
import { filtersKey, parseFeedParams, parseFeedSort } from "@/lib/feed-params";
import { getI18n } from "@/lib/i18n/server";
import { HomeComposerPrompt } from "@/components/home-composer-prompt";
import { FeedFilters, FeedSortToggle } from "@/components/posts/feed-filters";
import { PostList } from "@/components/posts/post-list";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.home };
}

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [profile, { t }, params] = await Promise.all([requireProfile(), getI18n(), searchParams]);
  const parsed = parseFeedParams(params);
  const sort = parseFeedSort(params);
  const filters = { postType: parsed.postType, topic: parsed.topic, language: parsed.language, sort };
  const { posts, nextCursor } = await getPosts(filters);
  const filtered = Boolean(filters.postType || filters.topic || filters.language);

  return (
    <>
      <HomeComposerPrompt name={profile.display_name} avatarKey={profile.avatar_key} avatarPath={profile.avatar_path} />
      <section aria-labelledby="feed-title">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 id="feed-title" className="text-lg font-semibold">
              {t.feed.title}
            </h2>
            <p className="text-xs text-muted-foreground">{sort === "top" ? t.feed.topNote : t.feed.latestNote}</p>
          </div>
          <FeedSortToggle />
        </div>
        <FeedFilters
          tabs={[
            { value: "all", label: t.common.all },
            { value: "text", label: t.common.text },
            { value: "voice", label: t.common.voice },
          ]}
        />
        <PostList
          key={filtersKey(filters)}
          initialPosts={posts}
          initialCursor={nextCursor}
          filters={filters}
          empty={{
            title: filtered ? t.feed.emptyFiltered : t.feed.empty,
            body: filtered ? undefined : t.feed.emptyBody,
            action: (
              <Button asChild>
                <Link href="/post/create">{t.nav.letItOut}</Link>
              </Button>
            ),
          }}
        />
      </section>
    </>
  );
}
