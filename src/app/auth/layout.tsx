import { SiteHeader } from "@/components/site-chrome";
import { LanguageSwitcher } from "@/components/language-switcher";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background-secondary">
      <SiteHeader />
      <main id="main" className="flex flex-1 flex-col items-center justify-start px-4 py-10 sm:justify-center sm:py-16">
        <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-6 shadow-soft sm:p-8">{children}</div>
        <LanguageSwitcher className="mt-6 sm:hidden" />
      </main>
    </div>
  );
}
