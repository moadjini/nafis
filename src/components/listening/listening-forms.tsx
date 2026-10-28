"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Clock, MessageSquareHeart, Send, X } from "lucide-react";
import { toast } from "sonner";
import {
  cancelSessionRequestAction,
  requestSessionAction,
  respondToSessionAction,
  saveListeningPreferencesAction,
} from "@/app/actions/listening";
import { CONTENT_LANGUAGES, LIMITS, TOPICS, type ContentLanguage, type Topic } from "@/lib/constants";
import { errorMessage } from "@/lib/errors";
import { useI18n } from "@/lib/i18n/client";
import type { ListenerRow, ListeningPreferences, OpenRequestRow, SessionRow } from "@/lib/types";
import { cn, interpolate } from "@/lib/utils";
import { Avatar } from "@/components/brand";
import { UserName } from "@/components/user-name";
import { Button } from "@/components/ui/button";
import { Chip, Field, Select, Textarea } from "@/components/ui/form-controls";
import { Badge, EmptyState } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";

function toggle<T>(list: T[], value: T) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function AvailabilityForm({ initial }: { initial: ListeningPreferences }) {
  const { t } = useI18n();
  const router = useRouter();
  const [available, setAvailable] = useState(initial.available);
  const [languages, setLanguages] = useState<ContentLanguage[]>(initial.languages.length ? initial.languages : ["en"]);
  const [topics, setTopics] = useState<Topic[]>(initial.topics);
  const [note, setNote] = useState(initial.note ?? "");
  const [pending, startTransition] = useTransition();

  function save(nextAvailable = available) {
    startTransition(async () => {
      const result = await saveListeningPreferencesAction({ available: nextAvailable, languages, topics, note: note || undefined });
      if (result.ok) {
        toast.success(t.listening.prefsSaved);
        router.refresh();
      } else toast.error(errorMessage(t, result.error));
    });
  }

  return (
    <div className="space-y-5">
      <label className="flex items-center justify-between gap-4 rounded-2xl border border-border p-4">
        <span>
          <span className="block font-medium">{available ? t.listening.available : t.listening.unavailable}</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">{t.listening.availableHint}</span>
        </span>
        <Switch
          checked={available}
          onCheckedChange={(value) => {
            setAvailable(value);
            save(value);
          }}
          aria-label={t.listening.available}
          disabled={pending}
        />
      </label>

      <details className="group rounded-2xl border border-border p-4">
        <summary className="cursor-pointer list-none text-sm font-medium text-primary-text">
          {t.onboarding.listening.languages} · {t.onboarding.listening.topics}
        </summary>
        <div className="mt-4 space-y-5">
          <fieldset>
            <legend className="text-sm font-medium">{t.onboarding.listening.languages}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {CONTENT_LANGUAGES.map((code) => (
                <Chip
                  key={code}
                  selected={languages.includes(code)}
                  onClick={() => setLanguages((l) => (l.includes(code) && l.length === 1 ? l : toggle(l, code)))}
                >
                  {t.languages[code]}
                </Chip>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-medium">{t.onboarding.listening.topics}</legend>
            <p className="text-xs text-muted-foreground">{t.onboarding.listening.topicsHint}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {TOPICS.map((topic) => (
                <Chip key={topic} selected={topics.includes(topic)} onClick={() => setTopics((l) => toggle(l, topic))}>
                  {t.topics[topic]}
                </Chip>
              ))}
            </div>
          </fieldset>
          <Field label={t.listening.noteLabel} htmlFor="listener-note" optional={t.common.optional}>
            <Textarea
              id="listener-note"
              value={note}
              maxLength={LIMITS.listenerNote}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.listening.notePlaceholder}
              className="min-h-20"
            />
          </Field>
          <Button type="button" variant="secondary" onClick={() => save()} loading={pending}>
            {t.listening.savePrefs}
          </Button>
        </div>
      </details>
    </div>
  );
}

export function RequestSessionForm({
  listeners,
  defaultLanguage,
  initialListenerHandle,
}: {
  listeners: ListenerRow[];
  defaultLanguage: ContentLanguage;
  initialListenerHandle?: string | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [language, setLanguage] = useState<ContentLanguage>(defaultLanguage);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [intro, setIntro] = useState("");
  const [target, setTarget] = useState<string | null>(initialListenerHandle ?? null);
  const [pending, startTransition] = useTransition();

  const matching = listeners.filter((l) => l.languages.includes(language));
  const targetListener = listeners.find((l) => l.handle === target) ?? null;

  function submit() {
    startTransition(async () => {
      const result = await requestSessionAction({
        language,
        topic,
        intro: intro || undefined,
        listenerHandle: target ?? undefined,
      });
      if (result.ok) {
        toast.success(t.listening.requestSent);
        router.push(`/sessions/${result.data.id}`);
      } else toast.error(errorMessage(t, result.error));
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.listening.requestLanguage} htmlFor="req-language">
          <Select id="req-language" value={language} onChange={(e) => setLanguage(e.target.value as ContentLanguage)}>
            {CONTENT_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {t.languages[code]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.listening.requestTopic} htmlFor="req-topic">
          <Select id="req-topic" value={topic ?? ""} onChange={(e) => setTopic((e.target.value || null) as Topic | null)}>
            <option value="">{t.common.noTopic}</option>
            {TOPICS.map((key) => (
              <option key={key} value={key}>
                {t.topics[key]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label={t.listening.requestIntro} htmlFor="req-intro">
        <Textarea
          id="req-intro"
          value={intro}
          maxLength={LIMITS.intro}
          onChange={(e) => setIntro(e.target.value)}
          placeholder={t.listening.requestIntroPlaceholder}
          className="min-h-24"
        />
      </Field>

      <fieldset>
        <legend className="text-sm font-medium">{t.listening.listenersTitle}</legend>
        <div className="mt-3 grid gap-2" role="radiogroup">
          <ListenerOption selected={target === null} onSelect={() => setTarget(null)}>
            <span className="flex size-10 items-center justify-center rounded-full bg-primary-faint">
              <MessageSquareHeart className="size-5 text-primary-text" aria-hidden />
            </span>
            <span className="font-medium">{t.listening.requestAnyone}</span>
          </ListenerOption>
          {matching.map((listener) => (
            <ListenerOption key={listener.handle} selected={target === listener.handle} onSelect={() => setTarget(listener.handle)}>
              <Avatar avatarKey={listener.avatar_key} avatarPath={listener.avatar_path} name={listener.display_name} />
              <span className="min-w-0 flex-1">
                <UserName name={listener.display_name} verified={listener.is_verified} className="flex" nameClassName="font-medium" />
                <span className="block text-xs text-muted-foreground">
                  {interpolate(t.listening.speaks, { languages: listener.languages.map((l) => t.languages[l]).join(", ") })}
                </span>
                {listener.note ? <span className="mt-1 block text-sm text-muted-foreground">{listener.note}</span> : null}
              </span>
            </ListenerOption>
          ))}
          {matching.length === 0 ? <p className="px-1 text-sm text-muted-foreground">{t.listening.listenersEmpty}</p> : null}
        </div>
      </fieldset>

      <Button type="button" onClick={submit} loading={pending} size="lg" className="w-full sm:w-auto">
        <Send aria-hidden />
        {targetListener ? interpolate(t.listening.requestSpecific, { name: targetListener.display_name }) : t.listening.requestSend}
      </Button>
    </div>
  );
}

function ListenerOption({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors",
        selected ? "border-primary bg-primary-faint" : "border-border hover:border-primary/40",
      )}
    >
      {children}
      {selected ? <Check className="ml-auto size-5 shrink-0 text-primary" aria-hidden /> : null}
    </button>
  );
}

export function IncomingRequests({ targeted, open, available }: { targeted: SessionRow[]; open: OpenRequestRow[]; available: boolean }) {
  const { t, relative } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function respond(id: string, accept: boolean) {
    setBusy(id);
    startTransition(async () => {
      const result = await respondToSessionAction(id, accept);
      setBusy(null);
      if (!result.ok) { toast.error(errorMessage(t, result.error)); return; }
      if (result.data.result === "accepted") {
        toast.success(t.listening.accepted);
        router.push(`/sessions/${id}`);
      } else {
        toast(result.data.result === "expired" ? t.listening.expired : t.listening.declined);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium">{t.listening.incomingTitle}</h3>
        {targeted.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t.listening.incomingEmpty}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {targeted.map((s) => (
              <RequestRow
                key={s.id}
                name={s.counterpart_display_name ?? t.notifications.someone}
                avatarKey={s.counterpart_avatar_key}
                avatarPath={s.counterpart_avatar_path}
                verified={s.counterpart_verified}
                meta={`${t.languages[s.language]}${s.topic ? ` · ${t.topics[s.topic]}` : ""} · ${relative(s.created_at)}`}
                intro={s.intro}
              >
                <Button size="sm" onClick={() => respond(s.id, true)} loading={pending && busy === s.id}>
                  <Check aria-hidden /> {t.listening.accept}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => respond(s.id, false)} disabled={pending}>
                  <X aria-hidden /> {t.listening.decline}
                </Button>
              </RequestRow>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium">{t.listening.openRequestsTitle}</h3>
        {!available ? (
          <p className="mt-2 text-sm text-muted-foreground">{t.listening.turnOnToSee}</p>
        ) : open.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t.listening.openRequestsEmpty}</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted-foreground">{t.listening.openRequestsHint}</p>
            <ul className="mt-3 space-y-2">
              {open.map((r) => (
                <RequestRow
                  key={r.id}
                  name={r.requester_display_name}
                  avatarKey={r.requester_avatar_key}
                  avatarPath={r.requester_avatar_path}
                  verified={r.requester_verified}
                  meta={`${t.languages[r.language]}${r.topic ? ` · ${t.topics[r.topic]}` : ""} · ${relative(r.created_at)}`}
                  intro={r.intro}
                >
                  <Button size="sm" onClick={() => respond(r.id, true)} loading={pending && busy === r.id}>
                    <Check aria-hidden /> {t.listening.accept}
                  </Button>
                </RequestRow>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function RequestRow({
  name,
  avatarKey,
  avatarPath,
  verified,
  meta,
  intro,
  children,
}: {
  name: string;
  avatarKey: string | null;
  avatarPath: string | null;
  verified: boolean;
  meta: string;
  intro: string | null;
  children: React.ReactNode;
}) {
  return (
    <li className="rounded-2xl border border-border p-4">
      <div className="flex items-start gap-3">
        <Avatar avatarKey={avatarKey} avatarPath={avatarPath} name={name} />
        <div className="min-w-0 flex-1">
          <UserName name={name} verified={verified} className="flex" nameClassName="font-medium" />
          <p className="text-xs text-muted-foreground">{meta}</p>
          {intro ? <p className="prose-nafis mt-2 text-sm">{intro}</p> : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">{children}</div>
    </li>
  );
}

export function SessionList({ sessions }: { sessions: SessionRow[] }) {
  const { t, relative } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (sessions.length === 0) {
    return <EmptyState icon={MessageSquareHeart} title={t.listening.sessionsEmpty} className="py-8" />;
  }

  function withdraw(id: string) {
    startTransition(async () => {
      const result = await cancelSessionRequestAction(id);
      if (result.ok) {
        toast.success(t.listening.requestCancelled);
        router.refresh();
      } else toast.error(errorMessage(t, result.error));
    });
  }

  return (
    <ul className="space-y-2">
      {sessions.map((s) => {
        const status = s.is_expired ? "expired" : s.status;
        const name =
          s.counterpart_display_name ?? (s.is_open_request ? t.listening.anyoneWaiting : t.notifications.someone);
        const open = s.status === "accepted" || s.status === "active";
        return (
          <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border p-3.5">
            {s.counterpart_display_name ? (
              <Avatar avatarKey={s.counterpart_avatar_key} avatarPath={s.counterpart_avatar_path} name={s.counterpart_display_name} />
            ) : (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-faint">
                <Clock className="size-5 text-primary-text" aria-hidden />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <UserName name={name} verified={s.counterpart_verified} className="flex" nameClassName="font-medium" />
              <p className="truncate text-xs text-muted-foreground">
                {s.my_role === "requester" ? t.listening.youRequested : interpolate(t.listening.theyRequested, { name })} ·{" "}
                {relative(s.last_message_at ?? s.created_at)}
              </p>
            </div>
            <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
              <Badge tone={open ? "green" : "neutral"} className="mr-auto sm:mr-0">
                {t.sessions.status[status]}
              </Badge>
              {s.status === "requested" && s.my_role === "requester" && !s.is_expired ? (
                <Button size="sm" variant="ghost" onClick={() => withdraw(s.id)} disabled={pending}>
                  {t.listening.cancelRequest}
                </Button>
              ) : null}
              <Button asChild size="sm" variant={open ? "primary" : "outline"}>
                <Link href={`/sessions/${s.id}`}>{t.listening.open}</Link>
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
