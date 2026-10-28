"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { getUnreadCountAction } from "@/app/actions/personal";
import { subscribeAuthorized } from "@/lib/realtime";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/client";
import { cn, interpolate } from "@/lib/utils";

/**
 * Unread badge kept live with Supabase Realtime. Realtime only delivers rows
 * the user may SELECT (recipient_id = auth.uid()); on any change we re-count
 * on the server rather than trusting the event payload.
 */
export function NotificationBell({ userId, initialCount }: { userId: string; initialCount: number }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [count, setCount] = useState(initialCount);
  const active = pathname.startsWith("/notifications");

  const [sourceCount, setSourceCount] = useState(initialCount);
  if (sourceCount !== initialCount) {
    setSourceCount(initialCount);
    setCount(initialCount);
  }

  useEffect(
    () =>
      subscribeAuthorized(createClient(), (supabase) =>
        supabase.channel(`notifications:${userId}`).on(
          "postgres_changes",
          { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
          () => {
            void getUnreadCountAction().then(setCount);
          },
        ),
      ),
    [userId],
  );

  const label = count > 0 ? `${t.nav.notifications} — ${interpolate(t.nav.unread, { count })}` : t.nav.notifications;

  return (
    <Link
      href="/notifications"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative inline-flex size-10 items-center justify-center rounded-full transition-colors",
        active ? "bg-primary-faint text-primary-text" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Bell className="size-5" aria-hidden />
      {count > 0 ? (
        <span className="absolute right-1 top-1 inline-flex min-w-[1.15rem] items-center justify-center rounded-full bg-primary-strong px-1 text-[0.65rem] font-semibold leading-[1.15rem] text-white ring-2 ring-background">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Link>
  );
}
