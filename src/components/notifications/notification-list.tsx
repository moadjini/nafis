"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, BellOff, CheckCheck, Ear, Heart, MessageCircle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { loadNotificationsAction, markNotificationsReadAction } from "@/app/actions/personal";
import { errorMessage } from "@/lib/errors";
import { useI18n } from "@/lib/i18n/client";
import type { NotificationRow } from "@/lib/types";
import { cn, interpolate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

const ICONS = {
  post_reply: MessageCircle,
  reply_reply: MessageCircle,
  reaction_summary: Heart,
  session_request: Ear,
  session_accepted: Ear,
  session_declined: Ear,
  session_cancelled: Ear,
  session_ended: Ear,
  session_message: Ear,
  moderation_notice: ShieldAlert,
  account_update: BadgeCheck,
} as const;

/** Links point at content that is re-authorised when opened. */
function hrefFor(n: NotificationRow) {
  if (n.related_session_id) return `/sessions/${n.related_session_id}`;
  if (n.related_post_id) return `/post/${n.related_post_id}`;
  return "/notifications";
}

export function NotificationList({ initial }: { initial: NotificationRow[] }) {
  const { t, relative } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [hasMore, setHasMore] = useState(initial.length === 30);
  const [pending, startTransition] = useTransition();

  const unread = items.some((n) => !n.read_at);

  function accountUpdateText(n: NotificationRow) {
    if (n.type !== "account_update") return null;
    if (n.data?.kind === "verified") return t.notifications.account.verified;
    if (n.data?.kind === "unverified") return t.notifications.account.unverified;
    if (n.data?.kind === "role" && n.data.role) return t.notifications.account[`role_${n.data.role}`];
    return null;
  }

  function markAll() {
    startTransition(async () => {
      const result = await markNotificationsReadAction("all");
      if (!result.ok) { toast.error(errorMessage(t, result.error)); return; }
      const now = new Date().toISOString();
      setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
      router.refresh();
    });
  }

  function markOne(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n)));
    void markNotificationsReadAction([id]);
  }

  function loadMore() {
    const last = items.at(-1);
    if (!last) return;
    startTransition(async () => {
      const result = await loadNotificationsAction(last.created_at);
      if (!result.ok) { toast.error(errorMessage(t, result.error)); return; }
      setItems((prev) => [...prev, ...result.data]);
      setHasMore(result.data.length === 30);
    });
  }

  if (items.length === 0) return <EmptyState icon={BellOff} title={t.notifications.empty} />;

  return (
    <div>
      {unread ? (
        <div className="mb-4 flex justify-end">
          <Button variant="ghost" size="sm" onClick={markAll} disabled={pending}>
            <CheckCheck aria-hidden /> {t.notifications.markAll}
          </Button>
        </div>
      ) : null}
      <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border">
        {items.map((n) => {
          const Icon = ICONS[n.type];
          const text = accountUpdateText(n) ?? interpolate(t.notifications.types[n.type], {
            actor: n.actor_display_name ?? t.notifications.someone,
            count: n.data?.count ?? 1,
          });
          return (
            <li key={n.id} className={cn("relative", !n.read_at && "bg-primary-faint/60")}>
              <Link href={hrefFor(n)} onClick={() => markOne(n.id)} className="flex items-start gap-3 p-4 transition-colors hover:bg-muted/60">
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full",
                    n.type === "moderation_notice" ? "bg-muted text-muted-foreground" : "bg-primary-soft text-primary-text",
                  )}
                >
                  <Icon className="size-[1.1rem]" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm", !n.read_at && "font-medium")}>{text}</span>
                  <time dateTime={n.created_at} className="mt-0.5 block text-xs text-muted-foreground">
                    {relative(n.created_at)}
                  </time>
                </span>
                {!n.read_at ? (
                  <span className="mt-2 size-2.5 shrink-0 rounded-full bg-primary" aria-label={t.notifications.unread} />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
      {hasMore ? (
        <div className="mt-6 text-center">
          <Button variant="outline" onClick={loadMore} loading={pending}>
            {t.common.loadMore}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
