"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { LOCALE_COOKIE } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { isLocale } from "@/lib/i18n";
import { forgotPasswordSchema, resetPasswordSchema, signInSchema, signUpSchema } from "@/lib/validation";
import { safeRedirectPath } from "@/lib/utils";

// Auth error keys map to dictionary entries under auth.errors.
type AuthErrorKey =
  | "invalidCredentials"
  | "emailNotConfirmed"
  | "userExists"
  | "weakPassword"
  | "rateLimited"
  | "generic"
  | "sessionMissing";

export type AuthResult =
  | { ok: true; email?: string }
  | { ok: false; error: AuthErrorKey; fieldErrors?: Record<string, string> };

function mapAuthError(error: { code?: string; status?: number; message?: string }): AuthErrorKey {
  switch (error.code) {
    case "invalid_credentials":
      return "invalidCredentials";
    case "email_not_confirmed":
      return "emailNotConfirmed";
    case "user_already_exists":
    case "email_exists":
      return "userExists";
    case "weak_password":
      return "weakPassword";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "rateLimited";
    case "session_not_found":
    case "session_expired":
      return "sessionMissing";
  }
  if (error.status === 429) return "rateLimited";
  return "generic";
}

function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) out[String(issue.path[0] ?? "_")] ??= issue.message;
  return out;
}

export async function signInAction(input: { email: string; password: string; next?: string | null }): Promise<AuthResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "generic", fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: mapAuthError(error) };

  redirect(safeRedirectPath(input.next, "/home"));
}

export async function signUpAction(input: { email: string; password: string }): Promise<AuthResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "generic", fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const locale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${env.siteUrl}/auth/callback?next=/onboarding`,
      data: { preferred_language: isLocale(locale) ? locale : "en" },
    },
  });
  if (error) return { ok: false, error: mapAuthError(error) };

  // When email confirmation is disabled in the project, a session is returned.
  if (data.session) redirect("/onboarding");
  return { ok: true, email: parsed.data.email };
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function requestPasswordResetAction(input: { email: string }): Promise<AuthResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "generic", fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.siteUrl}/auth/callback?next=/auth/reset-password`,
  });
  // Do not reveal whether the account exists; only surface rate limiting.
  if (error && mapAuthError(error) === "rateLimited") return { ok: false, error: "rateLimited" };
  return { ok: true, email: parsed.data.email };
}

export async function updatePasswordAction(input: { password: string; confirm: string }): Promise<AuthResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "generic", fieldErrors: fieldErrorsOf(parsed.error.issues) };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, error: "sessionMissing" };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: mapAuthError(error) };
  return { ok: true };
}
