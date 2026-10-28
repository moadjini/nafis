import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { SignUpForm } from "@/components/auth/auth-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.common.signUp };
}

export default async function SignUpPage() {
  const { t } = await getI18n();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t.auth.signUpTitle}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{t.auth.signUpSubtitle}</p>
      <div className="mt-7">
        <SignUpForm />
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t.auth.haveAccount}{" "}
        <Link href="/auth/sign-in" className="font-medium text-primary-text hover:underline">
          {t.common.signIn}
        </Link>
      </p>
    </>
  );
}
