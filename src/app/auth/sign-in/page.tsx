import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { safeRedirectPath } from "@/lib/utils";
import { SignInForm } from "@/components/auth/auth-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.common.signIn };
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ t }, { next }] = await Promise.all([getI18n(), searchParams]);
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t.auth.signInTitle}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{t.auth.signInSubtitle}</p>
      <div className="mt-7">
        <SignInForm next={next ? safeRedirectPath(next) : null} />
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t.auth.noAccount}{" "}
        <Link href="/auth/sign-up" className="font-medium text-primary-text hover:underline">
          {t.common.signUp}
        </Link>
      </p>
    </>
  );
}
