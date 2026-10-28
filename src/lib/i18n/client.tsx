"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Locale } from "@/lib/constants";
import { formatRelativeTime, type AdminDictionary, type ClientDictionary } from "./index";

type I18nValue = {
  locale: Locale;
  t: ClientDictionary;
  relative: (date: string | Date) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, dictionary, children }: { locale: Locale; dictionary: ClientDictionary; children: ReactNode }) {
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      t: dictionary,
      relative: (date) => formatRelativeTime(date, locale, dictionary.time.justNow),
    }),
    [locale, dictionary],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside <I18nProvider>");
  return value;
}

// Staff pages get the admin copy through a second provider, so member pages
// never download it.
const AdminCopyContext = createContext<AdminDictionary["admin"] | null>(null);

export function AdminCopyProvider({ admin, children }: { admin: AdminDictionary["admin"]; children: ReactNode }) {
  return <AdminCopyContext.Provider value={admin}>{children}</AdminCopyContext.Provider>;
}

export function useAdminI18n() {
  const base = useI18n();
  const admin = useContext(AdminCopyContext);
  if (!admin) throw new Error("useAdminI18n must be used inside <AdminCopyProvider>");
  const t = useMemo<AdminDictionary>(() => ({ ...base.t, admin }), [base.t, admin]);
  return { ...base, t };
}
