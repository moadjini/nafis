import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/constants";
import en, { type Dictionary } from "./dictionaries/en";
import so from "./dictionaries/so";

export type { Dictionary };

/** What member pages' client components receive: long-form page copy, the
 *  staff-only admin copy and push message text stay on the server. */
export type ClientDictionary = Omit<Dictionary, "pages" | "admin" | "pushMessages">;

/** Staff pages additionally receive the admin copy. */
export type AdminDictionary = ClientDictionary & Pick<Dictionary, "admin">;

export function toClientDictionary(dictionary: Dictionary): ClientDictionary {
  const copy: Partial<Dictionary> = { ...dictionary };
  delete copy.pages;
  delete copy.admin;
  delete copy.pushMessages;
  return copy as ClientDictionary;
}

export function toAdminDictionary(dictionary: Dictionary): AdminDictionary {
  const copy: Partial<Dictionary> = { ...dictionary };
  delete copy.pages;
  delete copy.pushMessages;
  return copy as AdminDictionary;
}

const dictionaries: Record<Locale, Dictionary> = { en, so };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}

/** BCP 47 tag used for Intl formatting. */
export function intlLocale(locale: Locale) {
  return locale === "so" ? "so-SO" : "en-GB";
}

export function formatRelativeTime(date: Date | string, locale: Locale, justNow: string, now = Date.now()) {
  const value = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.round((value.getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return justNow;

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["minute", 60],
    ["hour", 3600],
    ["day", 86400],
    ["week", 604800],
    ["month", 2629800],
    ["year", 31557600],
  ];
  let unit: Intl.RelativeTimeFormatUnit = "minute";
  let divisor = 60;
  for (const [u, d] of units) {
    if (abs >= d) {
      unit = u;
      divisor = d;
    }
  }
  try {
    return new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" }).format(
      Math.round(seconds / divisor),
      unit,
    );
  } catch {
    return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(Math.round(seconds / divisor), unit);
  }
}

export function formatDate(date: Date | string, locale: Locale, options: Intl.DateTimeFormatOptions) {
  const value = typeof date === "string" ? new Date(date) : date;
  try {
    return new Intl.DateTimeFormat(intlLocale(locale), options).format(value);
  } catch {
    return new Intl.DateTimeFormat("en", options).format(value);
  }
}
