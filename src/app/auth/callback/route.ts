import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/utils";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Handles links from Supabase auth emails (confirmation, password recovery)
 * and OAuth redirects. Supports both the PKCE `code` flow (default template)
 * and the `token_hash` flow (custom email templates).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeRedirectPath(searchParams.get("next"), "/home");
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let failed = true;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    failed = Boolean(error);
  }

  const destination = failed ? "/auth/error" : type === "recovery" ? "/auth/reset-password" : next;
  const response = NextResponse.redirect(new URL(destination, request.nextUrl.origin));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
