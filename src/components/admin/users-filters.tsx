"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useAdminI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-controls";

/** Search and filters live in the URL so results are shareable and paginate cleanly. */
export function UsersFilters({
  showRole = true,
  showSort = true,
  showVerified = true,
}: {
  showRole?: boolean;
  showSort?: boolean;
  showVerified?: boolean;
}) {
  const { t } = useAdminI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  function go(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
      <form
        role="search"
        className="flex flex-1 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: q.trim() || null });
        }}
      >
        <label className="relative flex-1">
          <span className="sr-only">{t.admin.users.search}</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.admin.users.search} className="h-10 pl-10 text-sm" maxLength={60} />
        </label>
        <Button type="submit" size="sm" className="h-10">
          {t.admin.users.searchButton}
        </Button>
      </form>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        {showRole ? (
          <Select aria-label={t.admin.users.colRole} value={params.get("role") ?? ""} onChange={(e) => go({ role: e.target.value || null })} className="h-10 text-sm sm:w-40">
            <option value="">{t.admin.users.allRoles}</option>
            <option value="member">{t.roles.member}</option>
            <option value="moderator">{t.roles.moderator}</option>
            <option value="super_admin">{t.roles.super_admin}</option>
          </Select>
        ) : null}
        {showVerified ? (
          <Select aria-label={t.admin.users.colVerification} value={params.get("verified") ?? ""} onChange={(e) => go({ verified: e.target.value || null })} className="h-10 text-sm sm:w-40">
            <option value="">{t.admin.users.anyVerification}</option>
            <option value="yes">{t.admin.users.verifiedOnly}</option>
            <option value="no">{t.admin.users.unverifiedOnly}</option>
          </Select>
        ) : null}
        <Select aria-label={t.admin.users.colStatus} value={params.get("status") ?? ""} onChange={(e) => go({ status: e.target.value || null })} className="h-10 text-sm sm:w-40">
          <option value="">{t.admin.users.anyStatus}</option>
          <option value="suspended">{t.admin.users.restrictedOnly}</option>
          <option value="active">{t.admin.users.activeOnly}</option>
        </Select>
        {showSort ? (
          <Select aria-label={t.admin.users.sort} value={params.get("sort") ?? ""} onChange={(e) => go({ sort: e.target.value || null })} className="h-10 text-sm sm:w-44">
            <option value="">{t.admin.users.sortNewest}</option>
            <option value="oldest">{t.admin.users.sortOldest}</option>
            <option value="name">{t.admin.users.sortName}</option>
            <option value="verified">{t.admin.users.sortVerified}</option>
          </Select>
        ) : null}
      </div>
    </div>
  );
}
