"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Compass, PenLine, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { completeOnboardingAction } from "@/app/actions/profile";
import { setLocaleAction } from "@/app/actions/preferences";
import { AVATARS, CONTENT_LANGUAGES, LIMITS, LOCALE_COOKIE, LOCALES, TOPICS, type AvatarKey, type ContentLanguage, type Locale, type Topic } from "@/lib/constants";
import { errorMessage } from "@/lib/errors";
import { useI18n } from "@/lib/i18n/client";
import { suggestPseudonym } from "@/lib/pseudonym";
import { cn, interpolate } from "@/lib/utils";
import { Avatar } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Chip, Field, Input } from "@/components/ui/form-controls";
import { Switch } from "@/components/ui/switch";

const TOTAL = 7;
const NATIVE: Record<Locale, string> = { en: "English", so: "Soomaali" };

export function OnboardingWizard({ initialName, initialLocale }: { initialName: string; initialLocale: Locale }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [pending, startTransition] = useTransition();

  const [language, setLanguage] = useState<Locale>(initialLocale);
  const [displayName, setDisplayName] = useState(initialName);
  const [avatarKey, setAvatarKey] = useState<AvatarKey>("leaf");
  const [available, setAvailable] = useState(false);
  const [listenLanguages, setListenLanguages] = useState<ContentLanguage[]>([initialLocale]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [agreed, setAgreed] = useState(false);

  const trimmedName = displayName.trim();
  const nameValid = trimmedName.length >= LIMITS.displayNameMin && trimmedName.length <= LIMITS.displayNameMax;

  function chooseLanguage(next: Locale) {
    setLanguage(next);
    if (next !== locale) {
      startTransition(async () => {
        await setLocaleAction(next);
        router.refresh();
      });
    }
  }

  function toggle<T>(list: T[], value: T) {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  function submit() {
    startTransition(async () => {
      const result = await completeOnboardingAction({
        language,
        displayName: trimmedName,
        avatarKey,
        listening: { available, languages: listenLanguages.length ? listenLanguages : [language], topics },
        acceptedGuidelines: agreed,
      });
      if (result.ok) {
        // Remember the chosen language even if step 1 kept the default.
        document.cookie = `${LOCALE_COOKIE}=${language}; path=/; max-age=31536000; samesite=lax`;
        setStep(TOTAL);
      } else toast.error(errorMessage(t, result.error));
    });
  }

  const next = () => setStep((s) => Math.min(TOTAL, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  return (
    <div className="rounded-3xl border border-border bg-surface p-6 shadow-soft sm:p-9">
      {step < TOTAL ? (
        <div className="mb-8">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{interpolate(t.onboarding.stepOf, { current: step, total: TOTAL - 1 })}</span>
            {step > 1 ? (
              <button type="button" onClick={back} className="inline-flex items-center gap-1 rounded-full px-2 py-1 hover:bg-muted">
                <ArrowLeft className="size-3.5" aria-hidden /> {t.common.back}
              </button>
            ) : null}
          </div>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={TOTAL - 1}
            aria-valuenow={step}
          >
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(step / (TOTAL - 1)) * 100}%` }} />
          </div>
        </div>
      ) : null}

      <div aria-live="polite">
        {step === 1 && (
          <Step title={t.onboarding.language.title} body={t.onboarding.language.body}>
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t.common.language}>
              {LOCALES.map((code) => (
                <button
                  key={code}
                  type="button"
                  role="radio"
                  aria-checked={language === code}
                  lang={code}
                  onClick={() => chooseLanguage(code)}
                  className={cn(
                    "flex items-center justify-between rounded-2xl border px-5 py-4 text-left transition-colors",
                    language === code ? "border-primary bg-primary-faint" : "border-border hover:border-primary/40",
                  )}
                >
                  <span className="font-medium">{NATIVE[code]}</span>
                  {language === code ? <Check className="size-5 text-primary" aria-hidden /> : null}
                </button>
              ))}
            </div>
            <Actions onNext={next} nextLabel={t.common.continue} pending={pending} />
          </Step>
        )}

        {step === 2 && (
          <Step title={t.onboarding.name.title} body={t.onboarding.name.body}>
            <Field label={t.onboarding.name.label} htmlFor="displayName" hint={t.onboarding.name.hint}>
              <div className="flex gap-2">
                <Input
                  id="displayName"
                  value={displayName}
                  maxLength={LIMITS.displayNameMax}
                  onChange={(e) => setDisplayName(e.target.value)}
                  aria-describedby="displayName-hint"
                  aria-invalid={!nameValid}
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setDisplayName(suggestPseudonym(language))}
                  aria-label={t.onboarding.name.generate}
                  title={t.onboarding.name.generate}
                >
                  <RefreshCw aria-hidden />
                </Button>
              </div>
            </Field>
            <Actions onNext={next} nextLabel={t.common.continue} disabled={!nameValid} />
          </Step>
        )}

        {step === 3 && (
          <Step title={t.onboarding.avatar.title} body={t.onboarding.avatar.body}>
            <div className="grid grid-cols-5 gap-3" role="radiogroup" aria-label={t.settings.avatar}>
              {AVATARS.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={avatarKey === key}
                  aria-label={t.avatars[key]}
                  onClick={() => setAvatarKey(key)}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-2xl border-2 transition-colors",
                    avatarKey === key ? "border-primary bg-primary-faint" : "border-transparent hover:bg-muted",
                  )}
                >
                  <Avatar avatarKey={key} name={trimmedName || "N"} size="lg" />
                </button>
              ))}
            </div>
            <div className="mt-6 flex items-center gap-3 rounded-2xl bg-background-secondary p-4">
              <Avatar avatarKey={avatarKey} name={trimmedName || "N"} />
              <span className="font-medium">{trimmedName}</span>
            </div>
            <Actions onNext={next} nextLabel={t.common.continue} />
          </Step>
        )}

        {step === 4 && (
          <Step title={t.onboarding.listening.title} body={t.onboarding.listening.body}>
            <label className="flex items-center justify-between gap-4 rounded-2xl border border-border p-4">
              <span className="text-sm font-medium">{t.onboarding.listening.available}</span>
              <Switch checked={available} onCheckedChange={setAvailable} aria-label={t.onboarding.listening.available} />
            </label>
            <fieldset className="mt-6">
              <legend className="text-sm font-medium">{t.onboarding.listening.languages}</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {CONTENT_LANGUAGES.map((code) => (
                  <Chip
                    key={code}
                    selected={listenLanguages.includes(code)}
                    onClick={() => setListenLanguages((l) => (l.includes(code) && l.length === 1 ? l : toggle(l, code)))}
                  >
                    {t.languages[code]}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <fieldset className="mt-6">
              <legend className="text-sm font-medium">{t.onboarding.listening.topics}</legend>
              <p className="mt-1 text-sm text-muted-foreground">{t.onboarding.listening.topicsHint}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {TOPICS.map((topic) => (
                  <Chip key={topic} selected={topics.includes(topic)} onClick={() => setTopics((l) => toggle(l, topic))}>
                    {t.topics[topic]}
                  </Chip>
                ))}
              </div>
            </fieldset>
            <Actions onNext={next} nextLabel={t.common.continue} onSkip={() => { setAvailable(false); next(); }} skipLabel={t.common.skip} />
          </Step>
        )}

        {step === 5 && (
          <Step title={t.onboarding.privacy.title} icon={ShieldCheck}>
            <ul className="space-y-3">
              {t.onboarding.privacy.points.map((point) => (
                <li key={point} className="flex gap-3 text-[0.95rem] leading-relaxed">
                  <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <Actions onNext={next} nextLabel={t.common.continue} />
          </Step>
        )}

        {step === 6 && (
          <Step title={t.onboarding.guidelines.title} icon={Sparkles}>
            <ul className="space-y-3">
              {t.onboarding.guidelines.points.map((point) => (
                <li key={point} className="flex gap-3 text-[0.95rem] leading-relaxed">
                  <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm">
              <Link href="/community-guidelines" target="_blank" className="font-medium text-primary-text hover:underline">
                {t.footer.guidelines}
              </Link>
            </p>
            <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-4">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 size-5 accent-[var(--primary-strong)]"
              />
              <span className="text-sm font-medium">{t.onboarding.guidelines.agree}</span>
            </label>
            <Actions onNext={submit} nextLabel={pending ? t.onboarding.saving : t.common.continue} disabled={!agreed} pending={pending} />
          </Step>
        )}

        {step === TOTAL && (
          <div className="py-4 text-center">
            <Avatar avatarKey={avatarKey} name={trimmedName} size="xl" className="mx-auto" />
            <h1 className="mt-6 text-2xl font-semibold tracking-tight">{interpolate(t.onboarding.finish.title, { name: trimmedName })}</h1>
            <p className="mx-auto mt-2 max-w-sm text-muted-foreground">{t.onboarding.finish.body}</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/post/create">
                  <PenLine aria-hidden /> {t.onboarding.finish.share}
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/explore">
                  <Compass aria-hidden /> {t.onboarding.finish.explore}
                </Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Step({
  title,
  body,
  icon: Icon,
  children,
}: {
  title: string;
  body?: string;
  icon?: typeof Check;
  children: React.ReactNode;
}) {
  return (
    <section>
      {Icon ? (
        <span className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-primary-faint">
          <Icon className="size-5 text-primary-text" aria-hidden />
        </span>
      ) : null}
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {body ? <p className="mt-2 text-muted-foreground">{body}</p> : null}
      <div className="mt-7">{children}</div>
    </section>
  );
}

function Actions({
  onNext,
  nextLabel,
  disabled,
  pending,
  onSkip,
  skipLabel,
}: {
  onNext: () => void;
  nextLabel: string;
  disabled?: boolean;
  pending?: boolean;
  onSkip?: () => void;
  skipLabel?: string;
}) {
  return (
    <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      {onSkip ? (
        <Button type="button" variant="ghost" onClick={onSkip}>
          {skipLabel}
        </Button>
      ) : null}
      <Button type="button" onClick={onNext} disabled={disabled} loading={pending} size="lg">
        {nextLabel}
      </Button>
    </div>
  );
}
