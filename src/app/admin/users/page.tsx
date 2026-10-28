import type { Metadata } from "next";
import { isSuperAdmin, requireProfile } from "@/lib/auth";
import { parseUserFilters } from "@/lib/admin-params";
import { adminListUsers } from "@/lib/data";
import { toAdminDictionary } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { AdminHeader, LoadError, NotAllowed, Pagination, Panel } from "@/components/admin/admin-ui";
import { UsersFilters } from "@/components/admin/users-filters";
import { UsersTable } from "@/components/admin/users-table";

const PAGE_SIZE = 20;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.admin.users.title };
}

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [profile, { t: dict, locale }, params] = await Promise.all([requireProfile("/admin/users"), getI18n(), searchParams]);
  const t = toAdminDictionary(dict);
  if (!isSuperAdmin(profile)) return <NotAllowed t={t} />;

  const filters = parseUserFilters(params);
  const result = await adminListUsers(filters, PAGE_SIZE);
  if (!result.ok) return result.error === "not_allowed" ? <NotAllowed t={t} /> : <LoadError t={t} />;
  const total = result.data[0]?.total_count ?? 0;

  return (
    <>
      <AdminHeader title={t.admin.users.title} subtitle={t.admin.users.subtitle} />
      <UsersFilters />
      <Panel>
        <UsersTable t={t} locale={locale} rows={result.data} viewerHandle={profile.handle} />
      </Panel>
      {total > 0 ? (
        <Pagination t={t} page={filters.page ?? 1} total={total} pageSize={PAGE_SIZE} basePath="/admin/users" params={filters.raw} />
      ) : null}
    </>
  );
}
