import { AUDIO } from "@/lib/constants";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

/**
 * Uploads a recording straight to the private Storage bucket with the user's
 * own access token (so storage RLS applies and owner_id is set server-side).
 * XHR is used instead of fetch to report upload progress.
 */
export async function uploadVoiceNote(
  blob: Blob,
  objectName: string,
  contentType: string,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; reason: "auth" | "network" | "rejected" }> {
  const { data } = await createClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, reason: "auth" };

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${env.supabaseUrl}/storage/v1/object/${AUDIO.bucket}/${encodeURIComponent(objectName)}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", env.supabasePublishableKey);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300 ? { ok: true } : { ok: false, reason: "rejected" });
    xhr.onerror = () => resolve({ ok: false, reason: "network" });
    xhr.onabort = () => resolve({ ok: false, reason: "network" });
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(blob);
  });
}
