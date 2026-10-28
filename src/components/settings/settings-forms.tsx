"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Download, LogOut, Moon, Monitor, Sun, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteAccountAction } from "@/app/actions/account";
import { signOutAction } from "@/app/actions/auth";
import { saveHiddenTopicsAction, saveNotificationPreferencesAction, setLocaleAction, setThemeAction } from "@/app/actions/preferences";
import { updateProfileAction } from "@/app/actions/profile";
import { unblockUserAction } from "@/app/actions/safety";
import { AVATARS, LIMITS, LOCALES, TOPICS, type AvatarKey, type Locale, type Theme, type Topic } from "@/lib/constants";
import { errorMessage } from "@/lib/errors";
import { useI18n } from "@/lib/i18n/client";
import type { BlockedUser, NotificationPreferences } from "@/lib/types";
import { cn, interpolate } from "@/lib/utils";
import { profileSchema } from "@/lib/validation";
import { Avatar } from "@/components/brand";
import { UserName } from "@/components/user-name";
import { Button } from "@/components/ui/button";
import { Chip, Field, Input, Textarea, describedBy } from "@/components/ui/form-controls";
import { Notice } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";

export function ProfileForm({
  initial,
  hasPicture = false,
}: {
  initial: { displayName: string; handle: string; avatarKey: AvatarKey; bio: string | null };
  /** With a picture, the abstract avatar is the fallback shown if it is removed. */
  hasPicture?: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: initial.displayName, handle: initial.handle, avatarKey: initial.avatarKey, bio: initial.bio ?? "" },
  });
  const errors = form.formState.errors;
  const avatarKey = useWatch({ control: form.control, name: "avatarKey" });
  const displayName = useWatch({ control: form.control, name: "displayName" });

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = await updateProfileAction(values);
      if (result.ok) {
        toast.success(t.settings.profileSaved);
        router.refresh();
      } else if (result.fieldErrors?.handle) {
        form.setError("handle", { message: result.fieldErrors.handle === "taken" ? t.settings.handleTaken : t.settings.handleHint });
      } else toast.error(errorMessage(t, result.error));
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <fieldset>
        <legend className="text-sm font-medium">{hasPicture ? t.avatarUpload.useAbstract : t.settings.avatar}</legend>
        <div className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-10" role="radiogroup">
          {AVATARS.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={avatarKey === key}
              aria-label={t.avatars[key]}
              onClick={() => form.setValue("avatarKey", key, { shouldDirty: true })}
              className={cn(
                "flex aspect-square items-center justify-center rounded-2xl border-2 transition-colors",
                avatarKey === key ? "border-primary bg-primary-faint" : "border-transparent hover:bg-muted",
              )}
            >
              <Avatar avatarKey={key} name={displayName || "N"} />
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.settings.displayName} htmlFor="displayName" error={errors.displayName ? t.onboarding.name.hint : null}>
          <Input id="displayName" maxLength={LIMITS.displayNameMax} aria-invalid={Boolean(errors.displayName)} aria-describedby={describedBy("displayName", { error: errors.displayName })} {...form.register("displayName")} />
        </Field>
        <Field label={t.settings.handle} htmlFor="handle" hint={t.settings.handleHint} error={errors.handle ? (errors.handle.message === t.settings.handleTaken ? t.settings.handleTaken : t.settings.handleHint) : null}>
          <Input
            id="handle"
            maxLength={24}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={Boolean(errors.handle)}
            aria-describedby={describedBy("handle", { hint: true, error: errors.handle })}
            {...form.register("handle")}
          />
        </Field>
      </div>
      <Field label={t.settings.bio} htmlFor="bio" optional={t.common.optional}>
        <Textarea id="bio" maxLength={LIMITS.bio} placeholder={t.settings.bioPlaceholder} className="min-h-20" {...form.register("bio")} />
      </Field>
      <Button type="submit" loading={pending}>
        {t.common.save}
      </Button>
    </form>
  );
}

export function LanguageAndThemeForm({ theme }: { theme: Theme }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const NATIVE: Record<Locale, string> = { en: "English", so: "Soomaali" };
  const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: "light", label: t.settings.themeLight, icon: Sun },
    { value: "dark", label: t.settings.themeDark, icon: Moon },
    { value: "system", label: t.settings.themeSystem, icon: Monitor },
  ];

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <fieldset disabled={pending}>
        <legend className="text-sm font-medium">{t.settings.languageSection}</legend>
        <p className="text-sm text-muted-foreground">{t.settings.languageHint}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {LOCALES.map((code) => (
            <Chip key={code} lang={code} selected={locale === code} onClick={() => run(() => setLocaleAction(code))}>
              {NATIVE[code]}
            </Chip>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={pending}>
        <legend className="text-sm font-medium">{t.settings.appearanceSection}</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {themes.map(({ value, label, icon: Icon }) => (
            <Chip key={value} selected={theme === value} onClick={() => run(() => setThemeAction(value))}>
              <Icon className="size-4" aria-hidden /> {label}
            </Chip>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export function NotificationPreferencesForm({ initial }: { initial: NotificationPreferences }) {
  const { t } = useI18n();
  const [prefs, setPrefs] = useState(initial);
  const [pending, startTransition] = useTransition();

  function update(key: keyof NotificationPreferences, value: boolean) {
    const next = { ...prefs, [key]: value };
    const previous = prefs;
    setPrefs(next);
    startTransition(async () => {
      const result = await saveNotificationPreferencesAction(next);
      if (result.ok) toast.success(t.settings.notifSaved);
      else {
        setPrefs(previous);
        toast.error(errorMessage(t, result.error));
      }
    });
  }

  const rows: { key: keyof NotificationPreferences; label: string }[] = [
    { key: "replies", label: t.settings.notifReplies },
    { key: "reaction_summaries", label: t.settings.notifReactions },
    { key: "sessions", label: t.settings.notifSessions },
    { key: "email_enabled", label: t.settings.notifEmail },
  ];

  return (
    <div className="divide-y divide-border rounded-2xl border border-border">
      {rows.map(({ key, label }) => (
        <div key={key} className="p-4">
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm">{label}</span>
            <Switch checked={prefs[key]} onCheckedChange={(v) => update(key, v)} disabled={pending} aria-label={label} />
          </label>
          {key === "email_enabled" ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t.settings.notifEmailNote}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function HiddenTopicsForm({ initial }: { initial: Topic[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [topics, setTopics] = useState<Topic[]>(initial);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await saveHiddenTopicsAction(topics);
      if (result.ok) {
        toast.success(t.settings.contentSaved);
        router.refresh();
      } else toast.error(errorMessage(t, result.error));
    });
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground">{t.settings.hiddenTopicsHint}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {TOPICS.map((topic) => (
          <Chip
            key={topic}
            selected={topics.includes(topic)}
            onClick={() => setTopics((l) => (l.includes(topic) ? l.filter((x) => x !== topic) : [...l, topic]))}
          >
            {t.topics[topic]}
          </Chip>
        ))}
      </div>
      <Button className="mt-4" variant="secondary" onClick={save} loading={pending}>
        {t.common.save}
      </Button>
    </div>
  );
}

export function BlockedList({ blocked }: { blocked: BlockedUser[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (blocked.length === 0) return <p className="text-sm text-muted-foreground">{t.settings.blockedEmpty}</p>;

  return (
    <ul className="divide-y divide-border rounded-2xl border border-border">
      {blocked.map((b) => (
        <li key={b.handle} className="flex items-center gap-3 p-3.5">
          <Avatar avatarKey={b.avatar_key} avatarPath={b.avatar_path} name={b.display_name} size="sm" />
          <UserName name={b.display_name} verified={b.is_verified} className="flex-1 text-sm" nameClassName="font-medium" />
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await unblockUserAction(b.handle);
                if (result.ok) {
                  toast.success(interpolate(t.settings.unblocked, { name: b.display_name }));
                  router.refresh();
                } else toast.error(errorMessage(t, result.error));
              })
            }
          >
            {t.settings.unblock}
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function DataAndAccount({ deletionAvailable }: { deletionAvailable: boolean }) {
  const { t } = useI18n();
  const [confirmation, setConfirmation] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-medium">{t.settings.dataSection}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t.settings.exportBody}</p>
        <Button asChild variant="secondary" className="mt-3">
          <a href="/api/account/export" download>
            <Download aria-hidden /> {t.settings.export}
          </a>
        </Button>
      </div>

      <div>
        <h3 className="text-sm font-medium">{t.settings.signOutSection}</h3>
        <form action={signOutAction} className="mt-3">
          <Button type="submit" variant="outline">
            <LogOut aria-hidden /> {t.nav.signOut}
          </Button>
        </form>
      </div>

      <div className="rounded-3xl border border-destructive/30 p-5">
        <h3 className="text-sm font-semibold text-destructive">{t.settings.deleteSection}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.settings.deleteBody}</p>
        {deletionAvailable ? (
          <div className="mt-4 space-y-3">
            <Field label={t.settings.deleteConfirmLabel} htmlFor="delete-confirm">
              <Input
                id="delete-confirm"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                className="max-w-xs"
              />
            </Field>
            <Button
              variant="destructive"
              disabled={confirmation !== "DELETE"}
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteAccountAction(confirmation);
                  if (result && !result.ok) toast.error(errorMessage(t, result.error));
                })
              }
            >
              <Trash2 aria-hidden /> {pending ? t.settings.deleting : t.settings.deleteButton}
            </Button>
          </div>
        ) : (
          <Notice tone="neutral" className="mt-4">
            {t.settings.deleteUnavailable}
          </Notice>
        )}
      </div>
    </div>
  );
}
