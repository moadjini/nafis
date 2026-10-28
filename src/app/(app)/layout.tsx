import { requireProfile, isModerator, isSuperAdmin } from "@/lib/auth";
import { getUnreadNotificationCount } from "@/lib/data";
import { AppShell } from "@/components/app-shell/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const unread = await getUnreadNotificationCount();

  return (
    <AppShell
      viewer={{
        id: profile.id,
        handle: profile.handle,
        displayName: profile.display_name,
        avatarKey: profile.avatar_key,
        avatarPath: profile.avatar_path,
        isVerified: profile.is_verified,
        isModerator: isModerator(profile),
        isSuperAdmin: isSuperAdmin(profile),
        suspendedUntil: profile.suspended_until,
      }}
      unreadCount={unread}
    >
      {children}
    </AppShell>
  );
}
