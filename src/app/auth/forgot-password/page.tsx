import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.auth.forgotTitle };
}

export default async function ForgotPasswordPage() {
  const { t } = await getI18n();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{t.auth.forgotTitle}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{t.auth.forgotSubtitle}</p>
      <div className="mt-7">
        <ForgotPasswordForm />
      </div>
      <p className="mt-6 text-center text-sm">
        <Link href="/auth/sign-in" className="font-medium text-primary-text hover:underline">
          {t.auth.backToSignIn}
        </Link>
      </p>
    </>
  );
}
