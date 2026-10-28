import { z } from "zod";
import { AUDIO } from "@/lib/constants";

// Public (browser-safe) configuration. Each variable is referenced literally so
// Next.js can inline it into client bundles.
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ message: "NEXT_PUBLIC_SUPABASE_URL must be a URL" }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing"),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_MAX_RECORDING_SECONDS: z.coerce.number().int().min(10).max(AUDIO.absoluteMaxSeconds).default(180),
  // Web push (VAPID public key). Optional: without it push is simply off.
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z
    .string()
    .regex(/^[A-Za-z0-9_-]{80,100}$/, "NEXT_PUBLIC_VAPID_PUBLIC_KEY must be a base64url VAPID public key")
    .optional(),
});

const parsed = publicSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  NEXT_PUBLIC_MAX_RECORDING_SECONDS: process.env.NEXT_PUBLIC_MAX_RECORDING_SECONDS || undefined,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || undefined,
});

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid public environment configuration. Copy .env.example to .env.local.\n${issues}`);
}

export const env = {
  supabaseUrl: parsed.data.NEXT_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: parsed.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  siteUrl: parsed.data.NEXT_PUBLIC_SITE_URL.replace(/\/$/, ""),
  maxRecordingSeconds: parsed.data.NEXT_PUBLIC_MAX_RECORDING_SECONDS,
  vapidPublicKey: parsed.data.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
} as const;
