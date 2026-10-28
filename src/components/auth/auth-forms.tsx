"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import {
  requestPasswordResetAction,
  signInAction,
  signUpAction,
  updatePasswordAction,
  type AuthResult,
} from "@/app/actions/auth";
import { useI18n } from "@/lib/i18n/client";
import { interpolate } from "@/lib/utils";
import { forgotPasswordSchema, resetPasswordSchema, signInSchema, signUpSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Field, Input, describedBy } from "@/components/ui/form-controls";
import { Notice } from "@/components/ui/misc";
import type { Dictionary } from "@/lib/i18n";

type AuthErrors = Dictionary["auth"]["errors"];

function useAuthMessages() {
  const { t } = useI18n();
  return (key: string | undefined) =>
    key ? ((t.auth.errors as Record<string, string>)[key] ?? t.auth.errors.generic) : undefined;
}

function FormError({ error }: { error: keyof AuthErrors | null }) {
  const { t } = useI18n();
  if (!error) return null;
  return (
    <div role="alert" className="rounded-2xl bg-destructive-soft px-4 py-3 text-sm text-destructive">
      {t.auth.errors[error]}
    </div>
  );
}

function applyServerResult(
  result: AuthResult,
  setError: (field: never, error: { message: string }) => void,
  setFormError: (e: keyof AuthErrors | null) => void,
) {
  if (result.ok) return;
  if (result.fieldErrors) {
    for (const [field, message] of Object.entries(result.fieldErrors)) setError(field as never, { message });
  }
  setFormError(result.error);
}

export function SignInForm({ next }: { next: string | null }) {
  const { t } = useI18n();
  const msg = useAuthMessages();
  const [formError, setFormError] = useState<keyof AuthErrors | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm({ resolver: zodResolver(signInSchema), defaultValues: { email: "", password: "" } });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await signInAction({ ...values, next });
      if (result) applyServerResult(result, form.setError, setFormError);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormError error={formError} />
      <Field label={t.auth.email} htmlFor="email" error={msg(errors.email?.message)}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={describedBy("email", { error: errors.email })}
          {...form.register("email")}
        />
      </Field>
      <Field label={t.auth.password} htmlFor="password" error={msg(errors.password?.message)}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={describedBy("password", { error: errors.password })}
          {...form.register("password")}
        />
      </Field>
      <div className="-mt-2 text-right">
        <Link href="/auth/forgot-password" className="text-sm font-medium text-primary-text hover:underline">
          {t.auth.forgotPassword}
        </Link>
      </div>
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        {pending ? t.auth.signingIn : t.common.signIn}
      </Button>
    </form>
  );
}

export function SignUpForm() {
  const { t } = useI18n();
  const msg = useAuthMessages();
  const [formError, setFormError] = useState<keyof AuthErrors | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm({ resolver: zodResolver(signUpSchema), defaultValues: { email: "", password: "" } });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await signUpAction(values);
      if (!result) return;
      if (result.ok) setSentTo(result.email ?? values.email);
      else applyServerResult(result, form.setError, setFormError);
    });
  });

  if (sentTo) {
    return (
      <div className="space-y-4 text-center" aria-live="polite">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary-faint">
          <MailCheck className="size-6 text-primary" aria-hidden />
        </div>
        <h2 className="text-xl font-semibold">{t.auth.checkEmailTitle}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{interpolate(t.auth.checkEmailBody, { email: sentTo })}</p>
        <p className="text-xs text-muted-foreground">{t.auth.checkEmailHint}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormError error={formError} />
      <Field label={t.auth.email} htmlFor="email" error={msg(errors.email?.message)}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={describedBy("email", { error: errors.email })}
          {...form.register("email")}
        />
      </Field>
      <Field label={t.auth.password} htmlFor="password" hint={t.auth.passwordHint} error={msg(errors.password?.message)}>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={describedBy("password", { hint: true, error: errors.password })}
          {...form.register("password")}
        />
      </Field>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t.auth.agree.split(/(\{guidelines\}|\{privacy\})/).map((part, i) =>
          part === "{guidelines}" ? (
            <Link key={i} href="/community-guidelines" className="font-medium text-primary-text underline-offset-2 hover:underline">
              {t.footer.guidelines}
            </Link>
          ) : part === "{privacy}" ? (
            <Link key={i} href="/privacy" className="font-medium text-primary-text underline-offset-2 hover:underline">
              {t.footer.privacy}
            </Link>
          ) : (
            part
          ),
        )}
      </p>
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        {pending ? t.auth.creating : t.common.signUp}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const { t } = useI18n();
  const msg = useAuthMessages();
  const [formError, setFormError] = useState<keyof AuthErrors | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await requestPasswordResetAction(values);
      if (result.ok) setSentTo(values.email);
      else applyServerResult(result, form.setError, setFormError);
    });
  });

  if (sentTo) {
    return (
      <Notice icon={MailCheck} title={t.auth.resetSentTitle}>
        {interpolate(t.auth.resetSentBody, { email: sentTo })}
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormError error={formError} />
      <Field label={t.auth.email} htmlFor="email" error={msg(errors.email?.message)}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={describedBy("email", { error: errors.email })}
          {...form.register("email")}
        />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        {t.auth.sendReset}
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const { t } = useI18n();
  const msg = useAuthMessages();
  const [formError, setFormError] = useState<keyof AuthErrors | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: "", confirm: "" } });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await updatePasswordAction(values);
      if (result.ok) setDone(true);
      else applyServerResult(result, form.setError, setFormError);
    });
  });

  if (done) {
    return (
      <div className="space-y-5">
        <Notice icon={MailCheck} title={t.auth.passwordUpdated} />
        <Button asChild className="w-full" size="lg">
          <Link href="/home">{t.common.continue}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormError error={formError} />
      <Field label={t.auth.newPassword} htmlFor="password" hint={t.auth.passwordHint} error={msg(errors.password?.message)}>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={describedBy("password", { hint: true, error: errors.password })}
          {...form.register("password")}
        />
      </Field>
      <Field label={t.auth.confirmPassword} htmlFor="confirm" error={msg(errors.confirm?.message)}>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.confirm)}
          aria-describedby={describedBy("confirm", { error: errors.confirm })}
          {...form.register("confirm")}
        />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        {t.auth.updatePassword}
      </Button>
    </form>
  );
}
