"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, BadgeCheck, BarChart3, LayoutDashboard, Rocket, ScrollText, ShieldCheck, Users } from "lucide-react";
import type { AvatarKey, StaffRole } from "@/lib/constants";
import { useAdminI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/avatar";
import { LogoMark } from "@/components/brand";
import { UserName } from "@/components/user-name";
import { Badge } from "@/components/ui/misc";

export type AdminViewer = {
  handle: string;
  displayName: string;
  avatarKey: AvatarKey;
  avatarPath: string | null;
  isVerified: boolean;
  role: StaffRole;
};

/**
 * Admin chrome. Navigation is filtered by role for convenience only; each page
 * checks the role on the server and each RPC re-checks it in the database.
 */
export function AdminShell({ viewer, children }: { viewer: AdminViewer; children: React.ReactNode }) {
  const { t } = useAdminI18n();
  const pathname = usePathname();
  const superAdmin = viewer.role === "super_admin";

  const items = [
    { href: "/admin", label: t.admin.nav.overview, icon: LayoutDashboard, superOnly: true, exact: true },
    { href: "/admin/users", label: t.admin.nav.users, icon: Users, superOnly: true },
    { href: "/admin/verification", label: t.admin.nav.verification, icon: BadgeCheck, superOnly: true },
    { href: "/admin/moderation", label: t.admin.nav.moderation, icon: ShieldCheck, superOnly: false },
    { href: "/admin/analytics", label: t.admin.nav.analytics, icon: BarChart3, superOnly: true },
    { href: "/admin/promotions", label: t.admin.nav.promotions, icon: Rocket, superOnly: true },
    { href: "/admin/audit", label: t.admin.nav.audit, icon: ScrollText, superOnly: false },
  ].filter((item) => superAdmin || !item.superOnly);

  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <div className="min-h-dvh bg-background-secondary">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
          <Link href={superAdmin ? "/admin" : "/admin/moderation"} className="flex items-center gap-2 rounded-xl">
            <LogoMark className="size-7" />
            <span className="font-semibold tracking-tight">{t.brand.name}</span>
          </Link>
          <Badge tone="green">{t.admin.staffArea}</Badge>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/home" className="hidden items-center gap-1.5 text-sm text-muted-foreground hover:text-primary-text sm:inline-flex">
              <ArrowLeft className="size-4" aria-hidden /> {t.admin.backToApp}
            </Link>
            <span className="hidden text-right text-xs leading-tight md:block">
              <UserName name={viewer.displayName} verified={viewer.isVerified} className="text-sm" nameClassName="font-medium" />
              <span className="block text-muted-foreground">{t.roles[viewer.role]}</span>
            </span>
            <Avatar avatarKey={viewer.avatarKey} avatarPath={viewer.avatarPath} name={viewer.displayName} size="sm" />
          </div>
        </div>
        {/* Mobile and tablet: horizontal section tabs */}
        <nav aria-label={t.admin.title} className="flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden">
          {items.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm transition-colors",
                  active ? "bg-primary-soft font-medium text-primary-text" : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="size-4" aria-hidden /> {label}
              </Link>
            );
          })}
          <Link href="/home" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground sm:hidden">
            <ArrowLeft className="size-4" aria-hidden /> {t.admin.backToApp}
          </Link>
        </nav>
      </header>

      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 border-r border-border bg-surface lg:block">
          <nav aria-label={t.admin.title} className="flex flex-col gap-0.5 p-3">
            {items.map(({ href, label, icon: Icon, exact }) => {
              const active = isActive(href, exact);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors",
                    active
                      ? "bg-primary-soft font-medium text-primary-text before:absolute before:left-0 before:top-2 before:h-6 before:w-1 before:rounded-full before:bg-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-[1.1rem]" aria-hidden />
                  {label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main id="main" className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
