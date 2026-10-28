import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { isModerator, isSuperAdmin, requireProfile } from "@/lib/auth";
import { MODERATOR_MAX_SUSPENSION_DAYS } from "@/lib/constants";
import { modListReports, modListRestrictions } from "@/lib/data";
import { formatDate, toAdminDictionary } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { cn, interpolate } from "@/lib/utils";
import { AdminHeader, LoadError, NotAllowed, Panel, RoleBadge } from "@/components/admin/admin-ui";
import { LiftSuspensionButton } from "@/components/admin/user-actions";
import { Avatar } from "@/components/avatar";
import { ModerationQueue } from "@/components/moderation/moderation-queue";
import { Notice } from "@/components/ui/misc";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.moderation.title };
}

const STATUSES = ["open", "resolved", "dismissed", "all"] as const;

export default async function ModerationCenterPage({ searchParams }: { searchParams: Promise<{ status?: string; view?: string }> }) {
  const [profile, { t: dict, locale }, params] = await Promise.all([requireProfile("/admin/moderation"), getI18n(), searchParams]);
  const t = toAdminDictionary(dict);
  // UI gate only; every moderation RPC re-checks the role in the database.
  if (!isModerator(profile)) return <NotAllowed t={t} body={t.admin.staffOnlyBody} />;
  const superAdmin = isSuperAdmin(profile);

  const view = params.view === "restrictions" ? "restrictions" : "reports";
  const status = STATUSES.find((s) => s === params.status) ?? "open";
  const statusLabels = {
    open: t.moderation.filterOpen,
    resolved: t.moderation.filterResolved,
    dismissed: t.moderation.filterDismissed,
    all: t.moderation.filterAll,
  };

  return (
    <>
      <AdminHeader
        title={t.moderation.title}
        subtitle={t.moderation.subtitle}
        action={
          <Link href="/admin/audit" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-text hover:underline">
            <ScrollText className="size-4" aria-hidden /> {t.moderation.audit}
          </Link>
        }
      />
      <Notice tone="green" className="mb-5">
        {t.moderation.sensitiveNote}
      </Notice>

      <nav aria-label={t.moderation.title} className="mb-4 inline-flex rounded-full border border-border bg-surface p-1">
        {(["reports", "restrictions"] as const).map((v) => (
          <Link
            key={v}
            href={v === "reports" ? "/admin/moderation" : "/admin/moderation?view=restrictions"}
            aria-current={v === view ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm transition-colors",
              v === view ? "bg-primary-strong font-medium text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.admin.moderationTabs[v]}
          </Link>
        ))}
      </nav>

      {view === "reports" ? (
        <>
          <nav aria-label={t.moderation.queue} className="mb-4 flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <Link
                key={s}
                href={s === "open" ? "/admin/moderation" : `/admin/moderation?status=${s}`}
                aria-current={s === status ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center rounded-full px-3.5 text-sm transition-colors",
                  s === status ? "bg-primary-soft font-medium text-primary-text" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {statusLabels[s]}
              </Link>
            ))}
          </nav>
          <ReportsView status={status} maxDays={superAdmin ? 3650 : MODERATOR_MAX_SUSPENSION_DAYS} />
        </>
      ) : (
        <RestrictionsView superAdmin={superAdmin} locale={locale} />
      )}
    </>
  );
}

async function ReportsView({ status, maxDays }: { status: string; maxDays: number }) {
  const { t: dict } = await getI18n();
  const t = toAdminDictionary(dict);
  const reports = await modListReports(status);
  if (!reports) return <LoadError t={t} />;
  return <ModerationQueue reports={reports} maxSuspensionDays={maxDays} />;
}

async function RestrictionsView({ superAdmin, locale }: { superAdmin: boolean; locale: "en" | "so" }) {
  const { t: dict } = await getI18n();
  const t = toAdminDictionary(dict);
  const result = await modListRestrictions();
  if (!result.ok) return result.error === "not_allowed" ? <NotAllowed t={t} /> : <LoadError t={t} />;

  return (
    <Panel>
      {result.data.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t.admin.restrictions.empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {result.data.map((r) => (
            <li key={r.handle} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar avatarKey={r.avatar_key} avatarPath={r.avatar_path} name={r.display_name} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {superAdmin ? (
                    <Link href={`/admin/users/${r.handle}`} className="hover:text-primary-text hover:underline">
                      {r.display_name}
                    </Link>
                  ) : (
                    r.display_name
                  )}{" "}
                  <span className="font-normal text-muted-foreground">@{r.handle}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {interpolate(t.admin.restrictions.until, { date: formatDate(r.suspended_until, locale, { dateStyle: "medium", timeStyle: "short" }) })}
                  {r.created_by_handle ? ` · ${interpolate(t.admin.restrictions.by, { handle: r.created_by_handle })}` : ""}
                </p>
                {r.reason ? <p className="mt-0.5 text-xs text-muted-foreground">{r.reason}</p> : null}
              </div>
              <RoleBadge t={t} role={r.role} />
              {superAdmin || r.role === "member" ? (
                <LiftSuspensionButton
                  superAdmin={superAdmin}
                  target={{
                    handle: r.handle,
                    displayName: r.display_name,
                    role: r.role,
                    isVerified: false,
                    suspendedUntil: r.suspended_until,
                    hasPicture: Boolean(r.avatar_path),
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
