import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Ear, Pencil, UserRoundX } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getDrafts, getPosts, getPublicProfile } from "@/lib/data";
import { formatDate } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { interpolate } from "@/lib/utils";
import { Avatar } from "@/components/brand";
import { UserName } from "@/components/user-name";
import { PostCard } from "@/components/posts/post-card";
import { PostList } from "@/components/posts/post-list";
import { ProfileActions } from "@/components/profile/profile-actions";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, Notice } from "@/components/ui/misc";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  return { title: handle === "me" ? undefined : `@${handle}` };
}

export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const [{ handle }, { t, locale }] = await Promise.all([params, getI18n()]);
  const viewer = await requireProfile(`/profile/${handle}`);
  if (handle === "me") redirect(`/profile/${viewer.handle}`);
  if (!/^[a-z0-9_]{3,24}$/i.test(handle)) return <NotFound />;

  const profile = await getPublicProfile(handle);
  if (!profile) return <NotFound />;

  const filters = { authorHandle: profile.handle };
  const [{ posts, nextCursor }, drafts] = await Promise.all([
    profile.is_blocked_by_me ? Promise.resolve({ posts: [], nextCursor: null }) : getPosts(filters),
    profile.is_me ? getDrafts() : Promise.resolve([]),
  ]);

  return (
    <>
      <section className="rounded-3xl border border-border bg-surface p-6">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar avatarKey={profile.avatar_key} avatarPath={profile.avatar_path} name={profile.display_name} size="2xl" className="ring-4 ring-primary-faint" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              <UserName name={profile.display_name} verified={profile.is_verified} />
            </h1>
            <p className="text-sm text-muted-foreground">@{profile.handle}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {interpolate(t.common.member, { date: formatDate(profile.member_since, locale, { month: "long", year: "numeric" }) })}
            </p>
          </div>
          {profile.is_me ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/settings">
                <Pencil aria-hidden /> {t.profile.editProfile}
              </Link>
            </Button>
          ) : (
            <ProfileActions handle={profile.handle} name={profile.display_name} blocked={profile.is_blocked_by_me} listening={profile.listening_available} />
          )}
        </div>
        {profile.bio ? <p className="prose-nafis mt-4 text-[0.95rem]">{profile.bio}</p> : null}
        {profile.listening_available ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge tone="green" className="gap-1.5">
              <Ear className="size-3.5" aria-hidden /> {t.profile.listening}
            </Badge>
            {profile.listening_languages?.length ? (
              <span className="text-xs text-muted-foreground">
                {interpolate(t.profile.listeningIn, { languages: profile.listening_languages.map((l) => t.languages[l]).join(", ") })}
              </span>
            ) : null}
            {profile.listening_note ? <p className="w-full text-sm text-muted-foreground">{profile.listening_note}</p> : null}
          </div>
        ) : null}
        {profile.is_me ? <p className="mt-4 text-xs text-muted-foreground">{t.profile.yourProfile}</p> : null}
      </section>

      {profile.is_blocked_by_me ? (
        <Notice tone="neutral" className="mt-6">
          {t.profile.blockedNotice}
        </Notice>
      ) : null}

      {profile.is_me ? (
        <section id="drafts" aria-labelledby="drafts-title" className="mt-8">
          <h2 id="drafts-title" className="mb-3 text-lg font-semibold">
            {t.profile.drafts}
          </h2>
          {drafts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.profile.noDrafts}</p>
          ) : (
            <ul className="space-y-4">
              {drafts.map((d) => (
                <li key={d.id}>
                  <PostCard post={d} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {!profile.is_blocked_by_me ? (
        <section aria-labelledby="posts-title" className="mt-8">
          <h2 id="posts-title" className="mb-3 text-lg font-semibold">
            {t.profile.posts}
          </h2>
          <PostList initialPosts={posts} initialCursor={nextCursor} filters={filters} empty={{ icon: "file", title: t.profile.noPosts }} />
        </section>
      ) : null}
    </>
  );
}

async function NotFound() {
  const { t } = await getI18n();
  return (
    <EmptyState
      icon={UserRoundX}
      title={t.profile.notFoundTitle}
      body={t.profile.notFoundBody}
      action={
        <Button asChild variant="secondary">
          <Link href="/home">{t.errors.goHome}</Link>
        </Button>
      }
    />
  );
}
