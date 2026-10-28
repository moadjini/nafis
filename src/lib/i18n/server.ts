import "server-only";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, THEME_COOKIE, THEMES, type Locale, type Theme } from "@/lib/constants";
import { getDictionary, isLocale } from "./index";

/** Locale from the cookie, else the browser's Accept-Language, else English. */
export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const accept = (await headers()).get("accept-language") ?? "";
  const preferred = accept
    .split(",")
    .map((part) => part.split(";")[0]?.trim().slice(0, 2).toLowerCase())
    .find((code) => isLocale(code));
  return isLocale(preferred) ? preferred : DEFAULT_LOCALE;
}

export async function getI18n() {
  const locale = await getLocale();
  return { locale, t: getDictionary(locale) };
}

export async function getTheme(): Promise<Theme> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return (THEMES as readonly string[]).includes(value ?? "") ? (value as Theme) : "light";
}
