"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Flag, Info, MoreHorizontal, PhoneOff, Send, UserX, X } from "lucide-react";
import { toast } from "sonner";
import {
  cancelSessionRequestAction,
  endSessionAction,
  respondToSessionAction,
  sendMessageAction,
} from "@/app/actions/listening";
import { markRelatedNotificationsReadAction } from "@/app/actions/personal";
import { LIMITS } from "@/lib/constants";
import { errorMessage, type ActionResult } from "@/lib/errors";
import { useI18n } from "@/lib/i18n/client";
import { subscribeAuthorized } from "@/lib/realtime";
import { createClient } from "@/lib/supabase/client";
import type { MessageRow, SessionRow, SessionStatus } from "@/lib/types";
import { cn, interpolate } from "@/lib/utils";
import { Avatar } from "@/components/brand";
import { VerifiedBadge } from "@/components/verified-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form-controls";
import { Badge, Notice } from "@/components/ui/misc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BlockDialog, ConfirmDialog, ReportDialog } from "@/components/safety/safety-dialogs";

export function SessionChat({ session, initialMessages, viewerId }: { session: SessionRow; initialMessages: MessageRow[]; viewerId: string }) {
  const { t, relative } = useI18n();
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [status, setStatus] = useState<SessionStatus>(session.status);
  const [draft, setDraft] = useState("");
  const [dialog, setDialog] = useState<"end" | "report" | "block" | null>(null);
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement | null>(null);

  const name = session.counterpart_display_name ?? (session.is_open_request ? t.listening.anyoneWaiting : t.notifications.someone);
  const canMessage = status === "accepted" || status === "active";
  const statusKey = session.is_expired && status === "requested" ? "expired" : status;

  const [source, setSource] = useState({ status: session.status, messages: initialMessages });
  if (source.status !== session.status || source.messages !== initialMessages) {
    setSource({ status: session.status, messages: initialMessages });
    setStatus(session.status);
    setMessages(initialMessages);
  }

  useEffect(() => {
    void markRelatedNotificationsReadAction("session", session.id);
  }, [session.id, messages.length]);

  // Live messages and status changes. Realtime enforces the same RLS policies
  // (only the two participants receive these rows).
  useEffect(
    () =>
      subscribeAuthorized(createClient(), (supabase) =>
        supabase
          .channel(`session:${session.id}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "private_messages", filter: `session_id=eq.${session.id}` },
            (payload) => {
              const row = payload.new as MessageRow;
              setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
            },
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "private_sessions", filter: `id=eq.${session.id}` },
            (payload) => {
              const next = (payload.new as { status?: SessionStatus }).status;
              if (next) setStatus(next);
              router.refresh();
            },
          ),
      ),
    [session.id, router],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  function send(event?: React.FormEvent) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || !canMessage) return;
    startTransition(async () => {
      const result = await sendMessageAction({ sessionId: session.id, content });
      if (result.ok) {
        setDraft("");
        setMessages((prev) => (prev.some((m) => m.id === result.data.id) ? prev : [...prev, result.data]));
        if (status === "accepted") setStatus("active");
      } else toast.error(errorMessage(t, result.error));
    });
  }

  function run(action: () => Promise<ActionResult<unknown>>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        setDialog(null);
        router.refresh();
      } else toast.error(errorMessage(t, result.error));
    });
  }

  return (
    <div className="flex min-h-[calc(100dvh-14rem)] flex-col">
      <header className="flex items-center gap-3 border-b border-border pb-4">
        {session.counterpart_display_name ? (
          <Avatar avatarKey={session.counterpart_avatar_key} avatarPath={session.counterpart_avatar_path} name={name} />
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="flex min-w-0 items-center gap-1.5 text-lg font-semibold">
            <span className="truncate">{interpolate(t.sessions.with, { name })}</span>
            {session.counterpart_verified ? <VerifiedBadge /> : null}
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge tone={canMessage ? "green" : "neutral"}>{t.sessions.status[statusKey]}</Badge>
            <span>{t.languages[session.language]}</span>
            {session.topic ? <span>· {t.topics[session.topic]}</span> : null}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger aria-label={t.common.more} className="inline-flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
            <MoreHorizontal className="size-5" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canMessage ? (
              <DropdownMenuItem onSelect={() => setDialog("end")}>
                <PhoneOff aria-hidden /> {t.sessions.end}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => setDialog("report")}>
              <Flag aria-hidden /> {t.sessions.report}
            </DropdownMenuItem>
            {session.counterpart_handle ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => setDialog("block")}>
                  <UserX aria-hidden /> {interpolate(t.sessions.block, { name })}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <Notice icon={Info} tone="neutral" className="mt-4">
        {t.sessions.privacyNote} {t.sessions.peerReminder}
      </Notice>

      {session.intro ? (
        <blockquote className="mt-4 rounded-2xl border-l-4 border-primary/40 bg-background-secondary px-4 py-3 text-sm">
          <p className="prose-nafis">{session.intro}</p>
        </blockquote>
      ) : null}

      {/* State banners */}
      {status === "requested" && !session.is_expired ? (
        session.my_role === "requester" ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-primary-faint p-4 text-sm">
            <span>{t.sessions.waiting}</span>
            <Button size="sm" variant="ghost" onClick={() => run(() => cancelSessionRequestAction(session.id), t.listening.requestCancelled)} disabled={pending}>
              {t.listening.cancelRequest}
            </Button>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl bg-primary-faint p-4 text-sm">
            <p>{interpolate(t.sessions.waitingListener, { name })}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => run(() => respondToSessionAction(session.id, true), t.listening.accepted)} loading={pending}>
                <Check aria-hidden /> {t.listening.accept}
              </Button>
              {!session.is_open_request ? (
                <Button size="sm" variant="ghost" onClick={() => run(() => respondToSessionAction(session.id, false), t.listening.declined)} disabled={pending}>
                  <X aria-hidden /> {t.listening.decline}
                </Button>
              ) : null}
            </div>
          </div>
        )
      ) : null}
      {status === "accepted" && messages.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-primary-faint p-4 text-sm">{t.sessions.acceptedHint}</p>
      ) : null}
      {status === "completed" || status === "cancelled" || session.is_expired ? (
        <p className="mt-4 rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
          {t.sessions.endReason[session.is_expired ? "expired" : (session.end_reason ?? "ended")]}
        </p>
      ) : null}

      {/* Messages */}
      <ol className="mt-6 flex-1 space-y-3" aria-live="polite" aria-label={t.sessions.title}>
        {messages.length === 0 && canMessage ? <li className="text-center text-sm text-muted-foreground">{t.sessions.noMessages}</li> : null}
        {messages.map((m) => {
          const mine = m.sender_id === viewerId;
          return (
            <li key={m.id} className={cn("group flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] sm:max-w-[75%]")}>
                <div
                  className={cn(
                    "prose-nafis rounded-3xl px-4 py-2.5 text-[0.95rem]",
                    mine ? "rounded-br-lg bg-primary-strong text-white" : "rounded-bl-lg bg-background-secondary text-foreground ring-1 ring-border",
                  )}
                >
                  {m.content}
                </div>
                <p className={cn("mt-1 flex items-center gap-2 px-2 text-[0.7rem] text-muted-foreground", mine && "justify-end")}>
                  <time dateTime={m.created_at}>{relative(m.created_at)}</time>
                  {!mine ? (
                    <button
                      type="button"
                      onClick={() => setReportMessageId(m.id)}
                      className="opacity-70 hover:text-destructive hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                    >
                      {t.sessions.reportMessage}
                    </button>
                  ) : null}
                </p>
              </div>
            </li>
          );
        })}
        <div ref={endRef} />
      </ol>

      {canMessage ? (
        <form onSubmit={send} className="sticky bottom-20 mt-6 flex items-end gap-2 rounded-3xl border border-border bg-surface p-2 shadow-soft md:bottom-4">
          <label htmlFor="message" className="sr-only">
            {t.sessions.placeholder}
          </label>
          <Textarea
            id="message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={t.sessions.placeholder}
            maxLength={LIMITS.message}
            rows={1}
            className="min-h-11 flex-1 resize-none border-0 bg-transparent py-2.5 focus-visible:outline-none"
          />
          <Button type="submit" size="icon" disabled={!draft.trim()} loading={pending} aria-label={t.common.send}>
            {!pending ? <Send aria-hidden /> : null}
          </Button>
        </form>
      ) : null}

      <ConfirmDialog
        open={dialog === "end"}
        onOpenChange={(o) => setDialog(o ? "end" : null)}
        title={t.sessions.endTitle}
        body={t.sessions.endBody}
        confirmLabel={t.sessions.end}
        onConfirm={() => run(() => endSessionAction(session.id), t.sessions.ended)}
        pending={pending}
      />
      <ReportDialog open={dialog === "report"} onOpenChange={(o) => setDialog(o ? "report" : null)} target={{ type: "session", id: session.id }} title={t.sessions.report} />
      <ReportDialog
        open={reportMessageId !== null}
        onOpenChange={(o) => !o && setReportMessageId(null)}
        target={{ type: "message", id: reportMessageId ?? undefined }}
        title={t.sessions.reportMessage}
      />
      {session.counterpart_handle ? (
        <BlockDialog
          open={dialog === "block"}
          onOpenChange={(o) => setDialog(o ? "block" : null)}
          handle={session.counterpart_handle}
          name={name}
          onBlocked={() => router.push("/listening?view=private")}
        />
      ) : null}
    </div>
  );
}
