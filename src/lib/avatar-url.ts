import { AVATAR_UPLOAD } from "@/lib/constants";
import { env } from "@/lib/env";

const PATH_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

/** Public URL of a processed profile picture, or null for abstract avatars. */
export function avatarUrl(path: string | null | undefined) {
  if (!path || !PATH_FORMAT.test(path)) return null;
  return `${env.supabaseUrl}/storage/v1/object/public/${AVATAR_UPLOAD.bucket}/${path}`;
}
