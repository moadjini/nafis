import Link from "next/link";
import { Ear, HeartHandshake, LifeBuoy, Mic, PenLine, Play, ShieldCheck, UserRound } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { Avatar } from "@/components/brand";
import { ReactionDemo } from "@/components/landing/reaction-demo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";

// Deterministic, decorative waveform for the example voice card.
const WAVE = [6, 10, 16, 12, 22, 28, 18, 24, 30, 20, 14, 26, 32, 22, 16, 24, 18, 12, 20, 26, 16, 10, 14, 8, 12, 18, 10, 6];

export default async function LandingPage() {
  const { t } = await getI18n();

  return (
    <>
      <SiteHeader />
      <main id="main">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-48 left-1/2 h-[30rem] w-[56rem] -translate-x-1/2 rounded-full bg-primary-faint opacity-70 blur-3xl"
          />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-14 sm:px-6 md:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-surface px-3.5 py-1.5 text-sm text-primary-text">
                <span lang="so" className="font-medium">
                  {t.brand.tagline}
                </span>
                <span aria-hidden className="text-primary/50">
                  ·
                </span>
                <span lang="en" className="text-muted-foreground">
                  A place to let it out.
                </span>
              </p>
              <h1 className="mt-6 max-w-xl text-[2.4rem] font-semibold leading-[1.1] tracking-tight text-foreground sm:text-5xl">
                {t.landing.heroTitle}
              </h1>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground">{t.landing.heroBody}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/post/create">
                    <PenLine aria-hidden />
                    {t.landing.ctaPrimary}
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link href="/listening">
                    <Ear aria-hidden />
                    {t.landing.ctaSecondary}
                  </Link>
                </Button>
              </div>
              <p className="mt-6 text-sm text-muted-foreground">{t.brand.philosophy}</p>
            </div>

            {/* Product preview — clearly labelled example content */}
            <div className="relative mx-auto w-full max-w-md" aria-label={t.common.demo}>
              <article className="rounded-3xl border border-border bg-surface p-5 shadow-soft">
                <div className="flex items-center gap-3">
                  <Avatar avatarKey="wave" name={t.landing.previewAuthor} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{t.landing.previewAuthor}</p>
                    <p className="text-xs text-muted-foreground">{t.landing.previewTime}</p>
                  </div>
                  <Badge>{t.common.demo}</Badge>
                </div>
                <p className="prose-nafis mt-4 text-[0.95rem] text-foreground">{t.landing.previewTextSample}</p>
                <div className="mt-4 flex items-center gap-2 text-xs text-primary-text">
                  <HeartHandshake className="size-4" aria-hidden />
                  {t.responsePrefs.just_listen.short}
                </div>
              </article>

              <article className="relative -mt-3 ml-6 rounded-3xl border border-border bg-surface p-5 shadow-float sm:ml-12">
                <div className="flex items-center gap-3">
                  <Avatar avatarKey="moon" name="Steady Cedar" size="sm" />
                  <p className="flex-1 text-sm text-muted-foreground">{t.landing.previewVoiceCaption}</p>
                  <Badge>{t.common.demo}</Badge>
                </div>
                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-primary-faint p-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-strong text-white">
                    <Play className="ml-0.5 size-4" aria-hidden fill="currentColor" />
                  </span>
                  <div className="flex h-9 flex-1 items-center gap-[3px]" aria-hidden>
                    {WAVE.map((h, i) => (
                      <span key={i} className="w-[3px] rounded-full bg-primary" style={{ height: `${h}px`, opacity: i < 11 ? 1 : 0.35 }} />
                    ))}
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground">1:24</span>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-border bg-background-secondary">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">{t.landing.howTitle}</h2>
            <ol className="mt-8 grid gap-6 md:grid-cols-3">
              {t.landing.how.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-semibold text-primary-text ring-1 ring-primary/25">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-medium">{step.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Pseudonymity, voice/text, reactions */}
        <section className="mx-auto grid max-w-6xl gap-14 px-4 py-20 sm:px-6 md:grid-cols-2">
          <div>
            <FeatureIcon icon={UserRound} />
            <h2 className="mt-4 text-xl font-semibold tracking-tight">{t.landing.anonymousTitle}</h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">{t.landing.anonymousBody}</p>
          </div>
          <div>
            <FeatureIcon icon={Mic} />
            <h2 className="mt-4 text-xl font-semibold tracking-tight">{t.landing.previewTitle}</h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">{t.landing.previewBody}</p>
          </div>
          <div className="md:col-span-2">
            <div className="rounded-3xl border border-border p-6 sm:p-8">
              <h2 className="text-xl font-semibold tracking-tight">{t.landing.reactionsTitle}</h2>
              <p className="mt-2 max-w-2xl leading-relaxed text-muted-foreground">{t.landing.reactionsBody}</p>
              <div className="mt-6">
                <ReactionDemo />
              </div>
            </div>
          </div>
        </section>

        {/* Safety + disclaimer */}
        <section className="border-t border-border bg-background-secondary">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-2">
            <div>
              <FeatureIcon icon={ShieldCheck} />
              <h2 className="mt-4 text-xl font-semibold tracking-tight">{t.landing.safetyTitle}</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">{t.landing.safetyBody}</p>
              <Button asChild variant="link" className="mt-3">
                <Link href="/community-guidelines">{t.landing.safetyCta}</Link>
              </Button>
            </div>
            <div>
              <FeatureIcon icon={LifeBuoy} />
              <h2 className="mt-4 text-xl font-semibold tracking-tight">{t.landing.disclaimerTitle}</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">{t.landing.disclaimerBody}</p>
              <Button asChild variant="link" className="mt-3">
                <Link href="/safety">{t.landing.disclaimerCta}</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Closing */}
        <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight">{t.landing.closingTitle}</h2>
          <p className="mt-3 text-lg text-muted-foreground">{t.landing.closingBody}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/auth/sign-up">{t.common.signUp}</Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link href="/auth/sign-in">{t.common.signIn}</Link>
            </Button>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function FeatureIcon({ icon: Icon }: { icon: typeof Mic }) {
  return (
    <span className="flex size-11 items-center justify-center rounded-2xl bg-primary-faint">
      <Icon className="size-5 text-primary-text" strokeWidth={1.8} aria-hidden />
    </span>
  );
}
