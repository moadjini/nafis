import "server-only";
import { z } from "zod";

// Server-only secrets. They are optional at boot so the app can run without
// them; features that need them report a clear configuration error instead.
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  CRON_SECRET: z.string().min(16).optional(),
  VAPID_PRIVATE_KEY: z.string().regex(/^[A-Za-z0-9_-]{40,50}$/, "VAPID_PRIVATE_KEY must be a base64url key").optional(),
  VAPID_SUBJECT: z
    .string()
    .regex(/^(mailto:\S+@\S+|https:\/\/\S+)$/, "VAPID_SUBJECT must be a mailto: address or an https: URL")
    .optional(),
});

const parsed = serverSchema.safeParse({
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
  CRON_SECRET: process.env.CRON_SECRET || undefined,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || undefined,
  VAPID_SUBJECT: process.env.VAPID_SUBJECT || undefined,
});

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid server environment configuration.\n${issues}`);
}

export const serverEnv = {
  serviceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
  cronSecret: parsed.data.CRON_SECRET,
  vapidPrivateKey: parsed.data.VAPID_PRIVATE_KEY,
  vapidSubject: parsed.data.VAPID_SUBJECT,
} as const;
