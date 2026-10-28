import type { Metadata } from "next";
import { isModerator, requireProfile } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { toAdminDictionary } from "@/lib/i18n";
import { AdminCopyProvider } from "@/lib/i18n/client";
import { AdminShell } from "@/components/admin/admin-shell";
import { NotAllowed } from "@/components/admin/admin-ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: { default: t.admin.title, template: `%s · ${t.admin.title} · ${t.brand.name}` }, robots: { index: false } };
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [profile, { t }] = await Promise.all([requireProfile("/admin"), getI18n()]);

  // Members see an explanation, never the admin chrome or data.
  if (!isModerator(profile) || !profile.role) {
    return (
      <main id="main" className="mx-auto max-w-xl px-4 py-16">
        <NotAllowed t={toAdminDictionary(t)} body={t.admin.staffOnlyBody} />
      </main>
    );
  }

  // Only staff pages receive the admin copy; member pages never download it.
  return (
    <AdminCopyProvider admin={t.admin}>
      <AdminShell
        viewer={{
          handle: profile.handle,
          displayName: profile.display_name,
          avatarKey: profile.avatar_key,
          avatarPath: profile.avatar_path,
          isVerified: profile.is_verified,
          role: profile.role,
        }}
      >
        {children}
      </AdminShell>
    </AdminCopyProvider>
  );
}
