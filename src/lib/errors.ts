import type { ClientDictionary } from "@/lib/i18n";

/** Error codes raised by our SQL functions/triggers or produced by the app. */
export const ERROR_CODES = [
  "generic",
  "network",
  "rate_limited",
  "not_allowed",
  "not_found",
  "not_authenticated",
  "suspended",
  "post_locked",
  "reply_locked",
  "cannot_unpublish",
  "audio_not_found",
  "invalid_thread",
  "thread_too_deep",
  "parent_not_found",
  "listener_unavailable",
  "duplicate_request",
  "too_many_open_requests",
  "invalid_transition",
  "cannot_report_self",
  "cannot_block_self",
  "validation",
  "configuration",
  "last_super_admin",
  "avatar_invalid",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: ErrorCode; fieldErrors?: Record<string, string> };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: ErrorCode, fieldErrors?: Record<string, string>): { ok: false; error: ErrorCode; fieldErrors?: Record<string, string> } {
  return fieldErrors ? { ok: false, error, fieldErrors } : { ok: false, error };
}

type DbError = { message?: string; code?: string; details?: string | null } | null | undefined;

/**
 * Maps a PostgREST / Postgres error to a safe, user-facing code. Raw database
 * messages are never sent to the browser.
 */
export function toErrorCode(error: DbError): ErrorCode {
  if (!error) return "generic";
  const message = error.message ?? "";
  if ((ERROR_CODES as readonly string[]).includes(message)) return message as ErrorCode;
  if (error.code === "42501") return "not_allowed"; // insufficient privilege / RLS violation
  if (error.code === "PGRST116") return "not_found"; // no rows for .single()
  if (error.code === "23503") return "not_found"; // FK target vanished
  if (/fetch failed|network|ECONNREFUSED|ETIMEDOUT/i.test(message)) return "network";
  return "generic";
}

export function errorMessage(t: Pick<ClientDictionary, "errors">, code: ErrorCode) {
  return t.errors[code] ?? t.errors.generic;
}
