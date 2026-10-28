import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewerProfile, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { Logo } from "@/components/brand";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.brand.name };
}

export default async function OnboardingPage() {
  await requireUser("/onboarding");
  const [profile, { locale }] = await Promise.all([getViewerProfile(), getI18n()]);
  if (!profile) redirect("/auth/sign-in");
  if (profile.onboarding_completed) redirect("/home");

  return (
    <div className="min-h-dvh bg-background-secondary">
      <header className="mx-auto flex h-16 max-w-2xl items-center px-4 sm:px-6">
        <Logo href="/onboarding" />
      </header>
      <main id="main" className="mx-auto max-w-2xl px-4 pb-16 sm:px-6">
        <OnboardingWizard initialName={profile.display_name} initialLocale={locale} />
      </main>
    </div>
  );
}
