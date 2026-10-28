import type { Metadata } from "next";
import Link from "next/link";
import { isSuperAdmin, requireProfile } from "@/lib/auth";
import { parseUserFilters } from "@/lib/admin-params";
import { adminListUsers } from "@/lib/data";
import { toAdminDictionary } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import { AdminHeader, LoadError, NotAllowed, Pagination, Panel } from "@/components/admin/admin-ui";
import { UsersFilters } from "@/components/admin/users-filters";
import { UsersTable } from "@/components/admin/users-table";

const PAGE_SIZE = 20;
const VIEWS = ["recent", "unverified", "all"] as const;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.admin.verificationPage.title };
}

export default async function AdminVerificationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [profile, { t: dict, locale }, params] = await Promise.all([requireProfile("/admin/verification"), getI18n(), searchParams]);
  const t = toAdminDictionary(dict);
  if (!isSuperAdmin(profile)) return <NotAllowed t={t} />;

  const view = VIEWS.find((v) => v === params.view) ?? "recent";
  const filters = parseUserFilters(params);
  if (view === "recent") {
    filters.verified = true;
    filters.sort = "verified";
  } else if (view === "unverified") {
    filters.verified = false;
  }

  const result = await adminListUsers(filters, PAGE_SIZE);
  if (!result.ok) return result.error === "not_allowed" ? <NotAllowed t={t} /> : <LoadError t={t} />;
  const total = result.data[0]?.total_count ?? 0;
  const labels = { recent: t.admin.verificationPage.recent, unverified: t.admin.verificationPage.unverified, all: t.admin.verificationPage.all };

  return (
    <>
      <AdminHeader title={t.admin.verificationPage.title} subtitle={t.admin.verificationPage.subtitle} />
      <nav aria-label={t.admin.verificationPage.title} className="mb-4 flex flex-wrap gap-1.5">
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={v === "recent" ? "/admin/verification" : `/admin/verification?view=${v}`}
            aria-current={v === view ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-full px-4 text-sm transition-colors",
              v === view ? "bg-primary-strong font-medium text-primary-foreground" : "bg-surface text-muted-foreground ring-1 ring-border hover:text-foreground",
            )}
          >
            {labels[v]}
          </Link>
        ))}
      </nav>
      <UsersFilters showRole={false} showVerified={false} showSort={view === "all"} />
      <Panel>
        <UsersTable t={t} locale={locale} rows={result.data} viewerHandle={profile.handle} variant="verification" />
      </Panel>
      {total > 0 ? (
        <Pagination
          t={t}
          page={filters.page ?? 1}
          total={total}
          pageSize={PAGE_SIZE}
          basePath="/admin/verification"
          params={{ ...filters.raw, view: view === "recent" ? undefined : view }}
        />
      ) : null}
    </>
  );
}
