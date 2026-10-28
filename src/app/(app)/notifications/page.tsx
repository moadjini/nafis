import type { Metadata } from "next";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getNotifications } from "@/lib/data";
import { getI18n } from "@/lib/i18n/server";
import { NotificationList } from "@/components/notifications/notification-list";
import { PageHeader } from "@/components/ui/misc";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.notifications.title };
}

export default async function NotificationsPage() {
  const [, { t }] = await Promise.all([requireProfile(), getI18n()]);
  const notifications = await getNotifications();

  return (
    <>
      <PageHeader
        title={t.notifications.title}
        action={
          <Link href="/settings#notifications" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary-text">
            <Settings2 className="size-4" aria-hidden /> {t.notifications.preferences}
          </Link>
        }
      />
      <NotificationList initial={notifications} />
    </>
  );
}
