import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getListeningPreferences, getPosts, listAvailableListeners, listMySessions, listOpenRequests } from "@/lib/data";
import { filtersKey, parseFeedParams } from "@/lib/feed-params";
import { getI18n } from "@/lib/i18n/server";
import type { FeedFilters as Filters } from "@/lib/types";
import { AvailabilityForm, IncomingRequests, RequestSessionForm, SessionList } from "@/components/listening/listening-forms";
import { FeedFilters } from "@/components/posts/feed-filters";
import { PostList } from "@/components/posts/post-list";
import { Notice, PageHeader, Section } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.listening.title };
}

export default async function ListeningPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [profile, { t }, params] = await Promise.all([requireProfile(), getI18n(), searchParams]);
  const view = params.view === "private" ? "private" : "community";

  const tabs = [
    { value: "community", label: t.listening.tabCommunity, href: "/listening" },
    { value: "private", label: t.listening.tabPrivate, href: "/listening?view=private" },
  ];

  return (
    <>
      <PageHeader title={t.listening.title} subtitle={t.listening.subtitle} />
      <Notice icon={Info} tone="green" className="mb-6">
        {t.listening.peerNote} <Link href="/safety">{t.nav.safety}</Link>
      </Notice>

      <nav aria-label={t.listening.title} className="mb-6 inline-flex rounded-full bg-muted p-1">
        {tabs.map((tab) => (
          <Link
            key={tab.value}
            href={tab.href}
            aria-current={view === tab.value ? "page" : undefined}
            className={cn(
              "inline-flex h-10 items-center rounded-full px-5 text-sm transition-colors",
              view === tab.value ? "bg-surface font-medium shadow-soft" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {view === "community" ? (
        <CommunityView params={params} />
      ) : (
        <PrivateView userId={profile.id} defaultLanguage={profile.preferred_language} listenerHandle={typeof params.to === "string" ? params.to : null} />
      )}
    </>
  );
}

async function CommunityView({ params }: { params: Record<string, string | string[] | undefined> }) {
  const { t } = await getI18n();
  const parsed = parseFeedParams(params);
  // Posts that invite responses: everything except "just expressing".
  const filters: Filters = { inviting: true, topic: parsed.topic, language: parsed.language, postType: parsed.postType };
  const { posts, nextCursor } = await getPosts(filters);

  return (
    <section aria-labelledby="community-listening">
      <h2 id="community-listening" className="text-lg font-semibold">
        {t.listening.communityTitle}
      </h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">{t.listening.communityBody}</p>
      <FeedFilters
        tabParam="type"
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
        empty={{ title: t.feed.empty, body: t.feed.emptyBody }}
      />
    </section>
  );
}

async function PrivateView({ userId, defaultLanguage, listenerHandle }: { userId: string; defaultLanguage: "en" | "so"; listenerHandle: string | null }) {
  const { t } = await getI18n();
  const [prefs, listeners, sessions, openRequests] = await Promise.all([
    getListeningPreferences(userId),
    listAvailableListeners(),
    listMySessions(),
    listOpenRequests(),
  ]);

  const targeted = sessions.filter((s) => s.my_role === "listener" && s.status === "requested" && !s.is_expired);
  const mine = sessions.filter((s) => !(s.my_role === "listener" && s.status === "requested"));

  return (
    <div>
      <Section title={t.listening.sessionsTitle}>
        <SessionList sessions={mine} />
      </Section>
      <Section title={t.listening.requestTitle} description={t.listening.requestBody}>
        <RequestSessionForm listeners={listeners} defaultLanguage={defaultLanguage} initialListenerHandle={listenerHandle} />
      </Section>
      <Section title={t.listening.availabilityTitle}>
        <AvailabilityForm initial={prefs} />
        <div className="mt-6">
          <IncomingRequests targeted={targeted} open={openRequests} available={prefs.available} />
        </div>
      </Section>
    </div>
  );
}
