"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Compass, Ear, Home, Plus, UserRound } from "lucide-react";
import type { AvatarKey } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/client";
import { cn, interpolate } from "@/lib/utils";
import { Logo } from "@/components/brand";
import { Notice } from "@/components/ui/misc";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";
import { ViewerProvider } from "./viewer-context";
import { EngagementPrompt } from "@/components/pwa/engagement-prompt";

export type Viewer = {
  id: string;
  handle: string;
  displayName: string;
  avatarKey: AvatarKey;
  avatarPath: string | null;
  isVerified: boolean;
  /** UI only: the server and database enforce every permission. */
  isModerator: boolean;
  isSuperAdmin: boolean;
  suspendedUntil: string | null;
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ viewer, unreadCount, children }: { viewer: Viewer; unreadCount: number; children: React.ReactNode }) {
  const { t, locale } = useI18n();
  const pathname = usePathname();
  const profileHref = `/profile/${viewer.handle}`;

  const desktopLinks = [
    { href: "/home", label: t.nav.home, icon: Home },
    { href: "/explore", label: t.nav.explore, icon: Compass },
    { href: "/listening", label: t.nav.listening, icon: Ear },
    { href: "/saved", label: t.nav.saved, icon: Bookmark },
    { href: profileHref, label: t.nav.profile, icon: UserRound },
  ];

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Logo href="/home" label={t.brand.name} />
          <nav aria-label={t.nav.main} className="ml-4 hidden flex-1 items-center gap-1 md:flex">
            {desktopLinks.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-sm transition-colors",
                    active
                      ? "bg-primary-soft font-medium text-primary-text after:absolute after:inset-x-4 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-primary"
                      : "text-muted-foreground hover:bg-primary-faint hover:text-primary-text",
                  )}
                >
                  <Icon className="size-[1.1rem]" aria-hidden />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <Link
              href="/post/create"
              className="hidden h-10 items-center gap-2 rounded-full bg-primary-strong px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover md:inline-flex"
            >
              <Plus className="size-4" aria-hidden />
              {t.nav.letItOut}
            </Link>
            <NotificationBell userId={viewer.id} initialCount={unreadCount} />
            <UserMenu viewer={viewer} />
          </div>
        </div>
      </header>

      {viewer.suspendedUntil ? (
        <div className="mx-auto max-w-3xl px-4 pt-4 sm:px-6">
          <Notice tone="neutral" title={t.errors.suspended}>
            {new Date(viewer.suspendedUntil).toLocaleDateString(locale === "so" ? "so-SO" : "en-GB")}
          </Notice>
        </div>
      ) : null}

      <main id="main" className="mx-auto w-full max-w-3xl px-4 pb-28 pt-6 sm:px-6 md:pb-16 md:pt-8">
        <ViewerProvider value={viewer}>{children}</ViewerProvider>
      </main>

      {/* Mobile bottom navigation */}
      <nav
        aria-label={t.nav.main}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-md grid-cols-5 items-center px-2">
          <BottomLink href="/home" label={t.nav.home} icon={Home} active={isActive(pathname, "/home")} />
          <BottomLink href="/explore" label={t.nav.explore} icon={Compass} active={isActive(pathname, "/explore")} />
          <li className="flex justify-center">
            <Link
              href="/post/create"
              aria-label={t.nav.share}
              className="flex size-12 items-center justify-center rounded-full bg-primary-strong text-primary-foreground shadow-soft transition-colors hover:bg-primary-hover"
            >
              <Plus className="size-6" aria-hidden />
            </Link>
          </li>
          <BottomLink href="/listening" label={t.nav.listening} icon={Ear} active={isActive(pathname, "/listening")} />
          <BottomLink href={profileHref} label={t.nav.profile} icon={UserRound} active={isActive(pathname, profileHref)} />
        </ul>
      </nav>
      <EngagementPrompt userId={viewer.id} />
      <span className="sr-only" aria-live="polite">
        {unreadCount > 0 ? interpolate(t.nav.unread, { count: unreadCount }) : ""}
      </span>
    </div>
  );
}

function BottomLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Home; active: boolean }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex flex-col items-center gap-1 rounded-xl py-1.5 text-[0.7rem] transition-colors",
          active ? "font-medium text-primary-text" : "text-muted-foreground",
        )}
      >
        <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-primary-soft")}>
          <Icon className={cn("size-[1.3rem]", active && "text-primary-text")} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
        </span>
        <span className="max-w-full truncate px-0.5">{label}</span>
      </Link>
    </li>
  );
}
