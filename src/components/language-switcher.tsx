"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { setLocaleAction } from "@/app/actions/preferences";
import { LOCALES, type Locale } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

const NATIVE_NAMES: Record<Locale, string> = { en: "English", so: "Soomaali" };

/** Compact two-option switch. Labels use each language's own name. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: Locale) {
    if (next === locale) return;
    startTransition(async () => {
      await setLocaleAction(next);
      router.refresh();
    });
  }

  return (
    <div
      role="group"
      aria-label={t.common.language}
      className={cn("inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1", pending && "opacity-70", className)}
    >
      <Languages className="ml-1.5 size-4 text-muted-foreground" aria-hidden />
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          onClick={() => choose(code)}
          aria-pressed={locale === code}
          className={cn(
            "h-8 rounded-full px-3 text-xs font-medium transition-colors",
            locale === code ? "bg-primary-faint text-primary-text" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {NATIVE_NAMES[code]}
        </button>
      ))}
    </div>
  );
}
