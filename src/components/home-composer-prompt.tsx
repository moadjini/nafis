"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Mic, PenLine } from "lucide-react";
import type { AvatarKey } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/client";
import { interpolate } from "@/lib/utils";
import { Avatar } from "@/components/brand";

const subscribeNever = () => () => undefined;

/** Greeting uses the visitor's local time, so it renders after hydration. */
export function HomeComposerPrompt({ name, avatarKey, avatarPath }: { name: string; avatarKey: AvatarKey; avatarPath: string | null }) {
  const { t } = useI18n();
  // Server render has no access to the visitor's clock; -1 renders a placeholder.
  const hour = useSyncExternalStore(subscribeNever, () => new Date().getHours(), () => -1);
  const template = hour < 0 ? null : hour < 12 ? t.home.greetingMorning : hour < 18 ? t.home.greetingAfternoon : t.home.greetingEvening;
  const greeting = template ? interpolate(template, { name }) : null;

  return (
    <section aria-labelledby="home-greeting" className="mb-8">
      <h1 id="home-greeting" className="min-h-8 text-2xl font-semibold tracking-tight">
        {greeting ?? " "}
      </h1>
      <p className="mt-1 text-muted-foreground">{t.home.reassurance}</p>

      <div className="mt-5 rounded-3xl border border-border bg-primary-faint/60 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <Avatar avatarKey={avatarKey} avatarPath={avatarPath} name={name} />
          <Link
            href="/post/create"
            className="flex h-12 flex-1 items-center rounded-full border border-border bg-surface px-5 text-[0.95rem] text-muted-foreground transition-colors hover:border-primary/40"
          >
            {t.home.prompt}
          </Link>
        </div>
        <div className="mt-3 flex gap-2 pl-[3.25rem]">
          <Link
            href="/post/create?type=text"
            className="inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium text-primary-text transition-colors hover:bg-primary-soft"
          >
            <PenLine className="size-4" aria-hidden /> {t.home.writeAction}
          </Link>
          <Link
            href="/post/create?type=voice"
            className="inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium text-primary-text transition-colors hover:bg-primary-soft"
          >
            <Mic className="size-4" aria-hidden /> {t.home.recordAction}
          </Link>
        </div>
      </div>
    </section>
  );
}
