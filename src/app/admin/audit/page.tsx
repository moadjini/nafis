import type { Metadata } from "next";
import { isModerator, isSuperAdmin, requireProfile } from "@/lib/auth";
import { ADMIN_ACTIONS, MODERATION_ACTIONS } from "@/lib/constants";
import { adminListAuditLogs } from "@/lib/data";
import { toAdminDictionary } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { AuditList } from "@/components/admin/audit-list";
import { AdminHeader, LoadError, NotAllowed, Pagination, Panel } from "@/components/admin/admin-ui";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-controls";
import { Notice } from "@/components/ui/misc";

const PAGE_SIZE = 30;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.admin.audit.title };
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; who?: string; page?: string }> }) {
  const [profile, { t: dict, locale }, params] = await Promise.all([requireProfile("/admin/audit"), getI18n(), searchParams]);
  const t = toAdminDictionary(dict);
  if (!isModerator(profile)) return <NotAllowed t={t} body={t.admin.staffOnlyBody} />;
  const superAdmin = isSuperAdmin(profile);

  // Moderators can only filter (and, in SQL, only see) moderation actions.
  const actions: readonly string[] = superAdmin ? [...MODERATION_ACTIONS, ...ADMIN_ACTIONS] : MODERATION_ACTIONS;
  const action = actions.includes(params.action ?? "") ? params.action! : null;
  const who = /^[a-z0-9_]{3,24}$/i.test(params.who ?? "") ? params.who!.toLowerCase() : null;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const result = await adminListAuditLogs({ action, affectedHandle: who, page }, PAGE_SIZE);
  if (!result.ok) return result.error === "not_allowed" ? <NotAllowed t={t} /> : <LoadError t={t} />;
  const total = result.data[0]?.total_count ?? 0;

  return (
    <>
      <AdminHeader title={t.admin.audit.title} subtitle={t.admin.audit.subtitle} />
      {!superAdmin ? (
        <Notice tone="neutral" className="mb-4">
          {t.admin.audit.moderatorScope}
        </Notice>
      ) : null}

      <form method="get" className="mb-4 flex flex-col gap-2 sm:flex-row" role="search">
        <Select name="action" defaultValue={action ?? ""} aria-label={t.admin.audit.action} className="h-10 text-sm sm:w-64">
          <option value="">{t.admin.audit.allActions}</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {t.moderation.actionLabels[a as keyof typeof t.moderation.actionLabels]}
            </option>
          ))}
        </Select>
        <Input name="who" defaultValue={who ?? ""} placeholder={t.admin.audit.filterHandle} aria-label={t.admin.audit.filterHandle} className="h-10 text-sm sm:w-64" maxLength={24} />
        <Button type="submit" size="sm" className="h-10">
          {t.admin.users.searchButton}
        </Button>
      </form>

      <Panel>
        <AuditList t={t} locale={locale} rows={result.data} linkUsers={superAdmin} />
      </Panel>
      {total > 0 ? (
        <Pagination t={t} page={page} total={total} pageSize={PAGE_SIZE} basePath="/admin/audit" params={{ action: action ?? undefined, who: who ?? undefined }} />
      ) : null}
    </>
  );
}
