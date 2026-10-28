import Link from "next/link";
import { Activity, BadgeCheck, Ban, Ear, FileText, Flag, LogIn, MessageCircle, ShieldCheck, UserPlus } from "lucide-react";
import { isSuperAdmin, requireProfile } from "@/lib/auth";
import { adminListAuditLogs, adminOverview } from "@/lib/data";
import { toAdminDictionary } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { cn, interpolate } from "@/lib/utils";
import { AuditList } from "@/components/admin/audit-list";
import { AdminHeader, LoadError, NotAllowed, Panel, StatCard } from "@/components/admin/admin-ui";

const PERIODS = [7, 30, 90] as const;

export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const [profile, { t: dict, locale }, params] = await Promise.all([requireProfile("/admin"), getI18n(), searchParams]);
  const t = toAdminDictionary(dict);
  if (!isSuperAdmin(profile)) return <NotAllowed t={t} />;

  const days = PERIODS.find((d) => String(d) === params.days) ?? 30;
  const [overview, recent] = await Promise.all([adminOverview(days), adminListAuditLogs({}, 8)]);
  if (!overview.ok) return overview.error === "not_allowed" ? <NotAllowed t={t} /> : <LoadError t={t} />;
  const o = overview.data;
  const inPeriod = (count: number) => interpolate(t.admin.overview.inPeriod, { count });
  const periodLabel = { 7: t.admin.overview.periods.d7, 30: t.admin.overview.periods.d30, 90: t.admin.overview.periods.d90 } as const;

  return (
    <>
      <AdminHeader
        title={t.admin.overview.title}
        subtitle={t.admin.overview.subtitle}
        action={
          <nav aria-label={t.admin.overview.period} className="inline-flex rounded-full border border-border bg-surface p-1">
            {PERIODS.map((d) => (
              <Link
                key={d}
                href={d === 30 ? "/admin" : `/admin?days=${d}`}
                aria-current={d === days ? "true" : undefined}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs transition-colors",
                  d === days ? "bg-primary-strong font-medium text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {periodLabel[d]}
              </Link>
            ))}
          </nav>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={UserPlus} label={t.admin.overview.totalUsers} value={o.total_users} detail={`${inPeriod(o.new_users)} · ${interpolate(t.admin.overview.onboarded, { count: o.onboarded_users })}`} />
        <StatCard icon={LogIn} label={t.admin.overview.signedIn} value={o.signed_in_users} detail={t.admin.overview.signedInHint} />
        <StatCard icon={Activity} label={t.admin.overview.contributors} value={o.active_contributors} detail={t.admin.overview.contributorsHint} />
        <StatCard
          icon={Flag}
          label={t.admin.overview.pendingReports}
          value={o.pending_reports}
          detail={interpolate(t.admin.overview.openCases, { count: o.open_cases })}
          tone={o.pending_reports > 0 ? "attention" : "default"}
        />
        <StatCard icon={FileText} label={t.admin.overview.posts} value={o.total_posts} detail={inPeriod(o.new_posts)} />
        <StatCard icon={MessageCircle} label={t.admin.overview.replies} value={o.total_replies} detail={inPeriod(o.new_replies)} />
        <StatCard icon={BadgeCheck} label={t.admin.overview.verified} value={o.verified_users} />
        <StatCard
          icon={ShieldCheck}
          label={t.admin.overview.staff}
          value={o.moderators + o.super_admins}
          detail={interpolate(t.admin.overview.staffDetail, { moderators: o.moderators, admins: o.super_admins })}
        />
        <StatCard icon={Ban} label={t.admin.overview.suspended} value={o.suspended_users} />
        <StatCard icon={Ear} label={t.admin.overview.openSessions} value={o.open_sessions} />
      </div>

      <Panel
        title={t.admin.overview.recentActivity}
        className="mt-6"
        action={
          <Link href="/admin/audit" className="text-sm font-medium text-primary-text hover:underline">
            {t.admin.overview.viewAll}
          </Link>
        }
      >
        {recent.ok ? (
          recent.data.length ? (
            <AuditList t={t} locale={locale} rows={recent.data} linkUsers />
          ) : (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t.admin.overview.noActivity}</p>
          )
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t.admin.loadErrorTitle}</p>
        )}
      </Panel>
    </>
  );
}
