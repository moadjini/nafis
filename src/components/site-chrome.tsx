import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { Logo } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";

/** Header for public pages (landing, guidelines, auth). */
export async function SiteHeader() {
  const [{ t }, user] = await Promise.all([getI18n(), getCurrentUser()]);
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Logo label={t.brand.name} />
        <div className="flex items-center gap-2">
          <LanguageSwitcher className="hidden sm:inline-flex" />
          {user ? (
            <Button asChild size="sm">
              <Link href="/home">{t.nav.home}</Link>
            </Button>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link href="/auth/sign-in">{t.common.signIn}</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/auth/sign-up">{t.common.signUp}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export async function SiteFooter() {
  const { t } = await getI18n();
  const links = [
    { href: "/privacy", label: t.footer.privacy },
    { href: "/community-guidelines", label: t.footer.guidelines },
    { href: "/safety", label: t.footer.safety },
    { href: "/about", label: t.footer.about },
  ];
  return (
    <footer className="border-t border-border bg-background-secondary">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Logo label={t.brand.name} />
            <p className="mt-3 text-sm text-muted-foreground">
              <span lang="so">{t.brand.tagline}</span> · {t.brand.philosophy}
            </p>
          </div>
          <nav aria-label={t.footer.about}>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-muted-foreground hover:text-primary-text">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="mt-6 sm:hidden">
          <LanguageSwitcher />
        </div>
        <p className="mt-8 max-w-2xl text-xs leading-relaxed text-muted-foreground">{t.footer.disclaimer}</p>
      </div>
    </footer>
  );
}
