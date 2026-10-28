import "server-only";
import type { z } from "zod";
import { getCurrentUser, type SessionUser } from "@/lib/auth";
import { fail, type ErrorCode } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Verifies the session for a server action. Never trust client-provided ids. */
export async function authenticate(): Promise<{ user: SessionUser; supabase: Supabase } | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return { user, supabase: await createClient() };
}

/** Validates input with Zod and returns a typed value or a failure result. */
export function validate<S extends z.ZodType>(schema: S, input: unknown):
  | { success: true; data: z.output<S> }
  | { success: false; result: { ok: false; error: ErrorCode; fieldErrors?: Record<string, string> } } {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { success: true, data: parsed.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".") || "_";
    fieldErrors[key] ??= issue.message;
  }
  return { success: false, result: fail("validation", fieldErrors) };
}

export const notAuthenticated = () => fail("not_authenticated");
