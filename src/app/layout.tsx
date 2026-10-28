import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { toClientDictionary } from "@/lib/i18n";
import { getI18n, getTheme } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { Toaster } from "@/components/toaster";
import { installCaptureScript, PwaSetup } from "@/components/pwa/pwa-setup";
import { cn } from "@/lib/utils";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { default: t.meta.title, template: `%s · ${t.brand.name}` },
    description: t.meta.description,
    applicationName: t.brand.name,
    referrer: "strict-origin-when-cross-origin",
    formatDetection: { telephone: false, email: false, address: false },
    // Icons come from the file conventions (favicon.ico, icon.svg, apple-icon.png);
    // setting metadata.icons here would replace them.
    appleWebApp: { capable: true, title: t.brand.name, statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1711" },
  ],
};

// Applies "Match my device" before first paint to avoid a theme flash.
const systemThemeScript = `try{if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.classList.add('dark')}}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [{ locale, t }, theme] = await Promise.all([getI18n(), getTheme()]);

  return (
    <html lang={locale} className={cn(inter.variable, theme === "dark" && "dark")} suppressHydrationWarning>
      <head>
        {theme === "system" ? <script dangerouslySetInnerHTML={{ __html: systemThemeScript }} /> : null}
        <script dangerouslySetInnerHTML={{ __html: installCaptureScript }} />
      </head>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <a
          href="#main"
          className="sr-only z-[100] rounded-full bg-primary-strong px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          {t.nav.skipToContent}
        </a>
        <I18nProvider locale={locale} dictionary={toClientDictionary(t)}>
          {children}
          <Toaster />
          <PwaSetup />
        </I18nProvider>
      </body>
    </html>
  );
}
