import type { Metadata } from "next";
import Link from "next/link";
import { EyeOff, Feather } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getPosts } from "@/lib/data";
import { filtersKey, parseFeedParams } from "@/lib/feed-params";
import { getI18n } from "@/lib/i18n/server";
import type { FeedFilters as Filters } from "@/lib/types";
import { dailyIndex } from "@/lib/utils";
import { FeedFilters } from "@/components/posts/feed-filters";
import { PostList } from "@/components/posts/post-list";
import { PageHeader } from "@/components/ui/misc";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.explore.title };
}

export default async function ExplorePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [, { t }, params] = await Promise.all([requireProfile(), getI18n(), searchParams]);
  const parsed = parseFeedParams(params);
  const tab = ["recent", "seeking", "voice", "text"].includes(parsed.tab) ? parsed.tab : "recent";

  const filters: Filters = { topic: parsed.topic, language: parsed.language };
  if (tab === "seeking") filters.seeking = true;
  if (tab === "voice") filters.postType = "voice";
  if (tab === "text") filters.postType = "text";

  const { posts, nextCursor } = await getPosts(filters);

  // A different reflective prompt each day — same for everyone, no tracking.
  const prompt = t.explore.prompts[dailyIndex(t.explore.prompts.length)]!;

  return (
    <>
      <PageHeader title={t.explore.title} subtitle={t.explore.subtitle} />

      <aside className="mb-6 rounded-3xl bg-primary-faint p-5">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-primary-text">
          <Feather className="size-3.5" aria-hidden /> {t.explore.promptTitle}
        </p>
        <p className="mt-2 text-lg font-medium leading-snug">{prompt}</p>
        <Link
          href={`/post/create?prompt=${encodeURIComponent(prompt)}`}
          className="mt-3 inline-flex text-sm font-medium text-primary-text hover:underline"
        >
          {t.explore.usePrompt} →
        </Link>
      </aside>

      <FeedFilters
        tabParam="tab"
        tabs={[
          { value: "recent", label: t.explore.tabRecent },
          { value: "seeking", label: t.explore.tabSeeking },
          { value: "voice", label: t.explore.tabVoice },
          { value: "text", label: t.explore.tabText },
        ]}
      />
      {tab === "seeking" ? <p className="-mt-2 mb-4 text-sm text-muted-foreground">{t.explore.seekingNote}</p> : null}

      <PostList
        key={filtersKey(filters)}
        initialPosts={posts}
        initialCursor={nextCursor}
        filters={filters}
        empty={{ title: filters.topic || filters.language ? t.feed.emptyFiltered : t.feed.empty, body: t.feed.emptyBody }}
      />

      <p className="mt-10 text-center text-sm">
        <Link href="/settings#content" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary-text">
          <EyeOff className="size-4" aria-hidden /> {t.explore.hideTopics}
        </Link>
      </p>
    </>
  );
}
