"use client";

import Link from "next/link";
import { HeartHandshake, LifeBuoy } from "lucide-react";
import { CONTENT_LANGUAGES, RESPONSE_PREFERENCES, TOPICS, type ContentLanguage, type ResponsePreference, type Topic } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Field, Select } from "@/components/ui/form-controls";

export function ResponsePreferenceField({
  value,
  onChange,
}: {
  value: ResponsePreference;
  onChange: (value: ResponsePreference) => void;
}) {
  const { t } = useI18n();
  return (
    <fieldset>
      <legend className="text-sm font-medium">{t.responsePrefs.label}</legend>
      <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup">
        {RESPONSE_PREFERENCES.map((pref) => (
          <label
            key={pref}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 text-sm leading-snug transition-colors",
              value === pref ? "border-primary bg-primary-faint" : "border-border hover:border-primary/40",
            )}
          >
            <input
              type="radio"
              name="response-preference"
              value={pref}
              checked={value === pref}
              onChange={() => onChange(pref)}
              className="mt-0.5 size-4 shrink-0 accent-[var(--primary-strong)]"
            />
            <span>{t.responsePrefs[pref].label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function TopicLanguageFields({
  topic,
  language,
  onTopic,
  onLanguage,
}: {
  topic: Topic | null;
  language: ContentLanguage;
  onTopic: (topic: Topic | null) => void;
  onLanguage: (language: ContentLanguage) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t.composer.topicLabel} htmlFor="topic" optional={t.common.optional}>
        <Select id="topic" value={topic ?? ""} onChange={(e) => onTopic((e.target.value || null) as Topic | null)}>
          <option value="">{t.common.noTopic}</option>
          {TOPICS.map((key) => (
            <option key={key} value={key}>
              {t.topics[key]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t.composer.languageLabel} htmlFor="language">
        <Select id="language" value={language} onChange={(e) => onLanguage(e.target.value as ContentLanguage)}>
          {CONTENT_LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {t.languages[code]}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

export function CrisisNotice() {
  const { t } = useI18n();
  return (
    <div role="note" className="rounded-2xl border border-primary/30 bg-primary-faint p-4 text-sm leading-relaxed">
      <p className="flex items-center gap-2 font-medium text-foreground">
        <LifeBuoy className="size-4 text-primary-text" aria-hidden /> {t.safety.crisisTitle}
      </p>
      <p className="mt-1.5 text-muted-foreground">{t.safety.crisisBody}</p>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href="/safety" target="_blank" className="font-medium text-primary-text hover:underline">
          {t.safety.crisisLink}
        </Link>
        <span className="text-muted-foreground">{t.safety.crisisContinue}</span>
      </p>
    </div>
  );
}

export function ResponsePreferenceGuidance({ preference }: { preference: ResponsePreference }) {
  const { t } = useI18n();
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-primary-faint px-4 py-3 text-sm text-foreground">
      <HeartHandshake className="mt-0.5 size-4 shrink-0 text-primary-text" aria-hidden />
      {t.responsePrefs[preference].guidance}
    </p>
  );
}
