import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink, UserRoundX } from "lucide-react";
import { isSuperAdmin, requireProfile } from "@/lib/auth";
import { adminGetUser } from "@/lib/data";
import { formatDate, toAdminDictionary } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { interpolate } from "@/lib/utils";
import { AuditList } from "@/components/admin/audit-list";
import { LoadError, NotAllowed, Panel, RoleBadge } from "@/components/admin/admin-ui";
import { UserActionsMenu } from "@/components/admin/user-actions";
import { Avatar } from "@/components/avatar";
import { UserName } from "@/components/user-name";
import { VerifiedBadge } from "@/components/verified-badge";
import { Badge, EmptyState } from "@/components/ui/misc";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  return { title: `@${handle}` };
}

export default async function AdminUserPage({ params }: { params: Promise<{ handle: string }> }) {
  const [{ handle }, profile, { t: dict, locale }] = await Promise.all([params, requireProfile("/admin/users"), getI18n()]);
  const t = toAdminDictionary(dict);
  if (!isSuperAdmin(profile)) return <NotAllowed t={t} />;

  const back = (
    <Link href="/admin/users" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary-text">
      <ArrowLeft className="size-4" aria-hidden /> {t.admin.detail.back}
    </Link>
  );

  if (!/^[a-z0-9_]{3,24}$/i.test(handle)) {
    return (
      <>
        {back}
        <EmptyState icon={UserRoundX} title={t.admin.detail.notFound} />
      </>
    );
  }

  const result = await adminGetUser(handle);
  if (!result.ok) {
    if (result.error === "not_allowed") return <NotAllowed t={t} />;
    return (
      <>
        {back}
        {result.error === "not_found" ? <EmptyState icon={UserRoundX} title={t.admin.detail.notFound} /> : <LoadError t={t} />}
      </>
    );
  }
  const u = result.data;
  const date = (value: string) => formatDate(value, locale, { dateStyle: "medium" });

  const counts = [
    { label: t.admin.detail.posts, value: u.counts.posts },
    { label: t.admin.detail.replies, value: u.counts.replies },
    { label: t.admin.detail.reportsOpen, value: u.counts.reports_open },
    { label: t.admin.detail.reportsTotal, value: u.counts.reports_total },
    { label: t.admin.detail.reportsFiled, value: u.counts.reports_filed },
    { label: t.admin.detail.moderated, value: u.counts.hidden_or_removed },
  ];

  return (
    <>
      {back}
      <section className="flex flex-wrap items-start gap-4 rounded-2xl border border-border bg-surface p-5">
        <Avatar avatarKey={u.avatar_key} avatarPath={u.avatar_path} name={u.display_name} size="xl" className="ring-4 ring-primary-faint" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">
            <UserName name={u.display_name} verified={u.is_verified} />
          </h1>
          <p className="text-sm text-muted-foreground">@{u.handle}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <RoleBadge t={t} role={u.role} />
            <span>{interpolate(t.admin.detail.joined, { date: date(u.created_at) })}</span>
            <span>· {interpolate(t.admin.detail.lastSignIn, { date: u.last_sign_in_at ? date(u.last_sign_in_at) : t.admin.never })}</span>
            {!u.onboarding_completed ? <Badge>{t.admin.users.onboardingPending}</Badge> : null}
          </div>
          {u.bio ? <p className="prose-nafis mt-3 text-sm">{u.bio}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/profile/${u.handle}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="size-4" aria-hidden /> <span className="hidden sm:inline">{t.admin.detail.openProfile}</span>
          </Link>
          <UserActionsMenu
            target={{
              handle: u.handle,
              displayName: u.display_name,
              role: u.role,
              isVerified: u.is_verified,
              suspendedUntil: u.suspended_until,
              hasPicture: Boolean(u.avatar_path),
            }}
            viewerRole="super_admin"
            viewerHandle={profile.handle}
            showDetailsLink={false}
          />
        </div>
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Panel title={t.admin.detail.role}>
          <div className="space-y-1 p-4 text-sm">
            <RoleBadge t={t} role={u.role} />
            {u.role !== "member" && u.role_granted_at ? (
              <p className="text-muted-foreground">
                {interpolate(t.admin.detail.roleSince, { date: date(u.role_granted_at) })}
                {u.role_granted_by ? ` · ${interpolate(t.admin.detail.grantedBy, { handle: u.role_granted_by })}` : ""}
              </p>
            ) : null}
            {u.role_reason ? <p className="text-muted-foreground">{interpolate(t.admin.detail.reasonPrefix, { reason: u.role_reason })}</p> : null}
          </div>
        </Panel>
        <Panel title={t.admin.detail.verification}>
          <div className="space-y-1 p-4 text-sm">
            {u.is_verified && u.verified_at ? (
              <>
                <p className="inline-flex items-center gap-1.5 font-medium">
                  <VerifiedBadge /> {interpolate(t.admin.detail.verifiedSince, { date: date(u.verified_at) })}
                </p>
                {u.verified_by ? <p className="text-muted-foreground">{interpolate(t.admin.detail.verifiedBy, { handle: u.verified_by })}</p> : null}
                {u.verification_reason ? (
                  <p className="text-muted-foreground">{interpolate(t.admin.detail.reasonPrefix, { reason: u.verification_reason })}</p>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground">{t.admin.users.notVerified}</p>
            )}
          </div>
        </Panel>
        <Panel title={t.admin.detail.restriction}>
          <div className="space-y-1 p-4 text-sm">
            {u.suspended_until ? (
              <>
                <Badge tone="danger">{interpolate(t.admin.users.suspendedUntil, { date: date(u.suspended_until) })}</Badge>
                {u.suspension_reason ? (
                  <p className="text-muted-foreground">{interpolate(t.admin.detail.reasonPrefix, { reason: u.suspension_reason })}</p>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground">{t.admin.detail.notRestricted}</p>
            )}
          </div>
        </Panel>
      </div>

      <Panel title={t.admin.detail.counts} className="mt-4">
        <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-6">
          {counts.map((c) => (
            <div key={c.label} className="bg-surface p-4">
              <dt className="text-xs text-muted-foreground">{c.label}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{c.value}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel title={t.admin.detail.history} className="mt-4">
        {u.history.length ? (
          <AuditList
            t={t}
            locale={locale}
            linkUsers={false}
            rows={u.history.map((h, i) => ({
              id: `${h.created_at}-${i}`,
              actor_handle: h.actor_handle,
              actor_display_name: null,
              action: h.action,
              target_type: h.target_type,
              target_id: "",
              affected_handle: u.handle,
              affected_display_name: u.display_name,
              reason: h.reason,
              metadata: h.metadata,
              created_at: h.created_at,
              total_count: u.history.length,
            }))}
          />
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t.admin.detail.historyEmpty}</p>
        )}
      </Panel>
    </>
  );
}
