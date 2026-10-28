"use server";

import { revalidatePath } from "next/cache";
import { AUDIO } from "@/lib/constants";
import { fetchFeedPage } from "@/lib/data";
import { env } from "@/lib/env";
import { authenticate, notAuthenticated, validate } from "@/lib/action-utils";
import { fail, ok, toErrorCode, type ActionResult } from "@/lib/errors";
import type { FeedCursor, PostRow } from "@/lib/types";
import { feedQuerySchema, textPostSchema, updatePostSchema, uuidSchema, voicePostSchema } from "@/lib/validation";

export async function loadPostsAction(input: unknown): Promise<ActionResult<{ posts: PostRow[]; nextCursor: FeedCursor | null }>> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(feedQuerySchema, input);
  if (!v.success) return v.result;
  const { cursor, ...filters } = v.data;

  const page = await fetchFeedPage(auth.supabase, filters, cursor ?? null);
  if (!page.ok) return fail(toErrorCode(page.error));
  return ok({ posts: page.posts, nextCursor: page.nextCursor });
}

export async function createTextPostAction(input: unknown): Promise<ActionResult<{ id: string; draft: boolean }>> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(textPostSchema, input);
  if (!v.success) return v.result;
  const d = v.data;

  const { data, error } = await auth.supabase
    .from("posts")
    .insert({
      author_id: auth.user.id,
      post_type: "text",
      content: d.content,
      caption: d.caption ?? null,
      language: d.language,
      topic: d.topic ?? null,
      response_preference: d.responsePreference,
      visibility: d.asDraft ? "draft" : "community",
    })
    .select("id")
    .single();
  if (error) return fail(toErrorCode(error));

  revalidatePath("/home");
  return ok({ id: data.id as string, draft: d.asDraft });
}

export async function createVoicePostAction(input: unknown): Promise<ActionResult<{ id: string; draft: boolean }>> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(voicePostSchema, input);
  if (!v.success) return v.result;
  const d = v.data;

  if (d.durationSeconds > env.maxRecordingSeconds + 1) return fail("validation", { durationSeconds: "too_long" });

  // The insert trigger verifies the object exists and is owned by this user.
  const { data, error } = await auth.supabase
    .from("posts")
    .insert({
      author_id: auth.user.id,
      post_type: "voice",
      audio_storage_path: d.audioPath,
      audio_mime_type: d.audioMimeType,
      audio_duration_seconds: Math.max(1, Math.round(d.durationSeconds)),
      caption: d.caption ?? null,
      language: d.language,
      topic: d.topic ?? null,
      response_preference: d.responsePreference,
      visibility: d.asDraft ? "draft" : "community",
    })
    .select("id")
    .single();
  if (error) return fail(toErrorCode(error));

  revalidatePath("/home");
  return ok({ id: data.id as string, draft: d.asDraft });
}

/** Removes an uploaded recording the user decided not to publish. */
export async function discardUploadAction(path: string): Promise<ActionResult> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(voicePostSchema.shape.audioPath, path);
  if (!v.success) return v.result;

  // Never delete audio that is attached to a post; storage RLS limits this to the owner.
  const { data: attached } = await auth.supabase.from("posts").select("id").eq("audio_storage_path", v.data).maybeSingle();
  if (attached) return fail("not_allowed");

  const { error } = await auth.supabase.storage.from(AUDIO.bucket).remove([v.data]);
  if (error) return fail("generic");
  return ok(null);
}

export async function updatePostAction(input: unknown): Promise<ActionResult> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(updatePostSchema, input);
  if (!v.success) return v.result;
  const d = v.data;

  const patch: Record<string, unknown> = {
    caption: d.caption ?? null,
    topic: d.topic,
    language: d.language,
    response_preference: d.responsePreference,
  };
  if (d.content !== undefined) patch.content = d.content;
  if (d.publish) patch.visibility = "community";

  const { data, error } = await auth.supabase
    .from("posts")
    .update(patch)
    .eq("id", d.postId)
    .eq("author_id", auth.user.id)
    .select("id");
  if (error) return fail(toErrorCode(error));
  if (!data?.length) return fail("not_found");

  revalidatePath(`/post/${d.postId}`);
  return ok(null);
}

export async function deletePostAction(postId: string): Promise<ActionResult> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(uuidSchema, postId);
  if (!v.success) return v.result;

  const { data: post } = await auth.supabase
    .from("posts")
    .select("id, audio_storage_path")
    .eq("id", v.data)
    .eq("author_id", auth.user.id)
    .maybeSingle();
  if (!post) return fail("not_found");

  const { error } = await auth.supabase.from("posts").delete().eq("id", v.data).eq("author_id", auth.user.id);
  if (error) return fail(toErrorCode(error));

  // Remove the recording too. If this fails the cleanup job removes the orphan.
  if (post.audio_storage_path) {
    await auth.supabase.storage.from(AUDIO.bucket).remove([post.audio_storage_path as string]);
  }

  revalidatePath("/home");
  return ok(null);
}

/**
 * Returns a short-lived signed URL for a voice post the user may hear. The URL
 * is created with the user's own session, so storage RLS re-checks access.
 */
export async function getAudioUrlAction(postId: string): Promise<ActionResult<{ url: string }>> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(uuidSchema, postId);
  if (!v.success) return v.result;

  const { data: path, error } = await auth.supabase.rpc("get_post_audio_path", { p_post_id: v.data });
  if (error || !path) return fail("not_found");

  const { data, error: signError } = await auth.supabase.storage
    .from(AUDIO.bucket)
    .createSignedUrl(path as string, AUDIO.signedUrlSeconds);
  if (signError || !data?.signedUrl) return fail("not_found");
  return ok({ url: data.signedUrl });
}

export async function setBookmarkAction(postId: string, saved: boolean): Promise<ActionResult<{ saved: boolean }>> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(uuidSchema, postId);
  if (!v.success) return v.result;

  const { error } = saved
    ? await auth.supabase
        .from("bookmarks")
        .upsert({ user_id: auth.user.id, post_id: v.data }, { onConflict: "user_id,post_id", ignoreDuplicates: true })
    : await auth.supabase.from("bookmarks").delete().eq("user_id", auth.user.id).eq("post_id", v.data);
  if (error) return fail(toErrorCode(error));
  revalidatePath("/saved");
  return ok({ saved });
}

export async function setThreadMutedAction(postId: string, muted: boolean): Promise<ActionResult<{ muted: boolean }>> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(uuidSchema, postId);
  if (!v.success) return v.result;

  const { error } = muted
    ? await auth.supabase
        .from("muted_threads")
        .upsert({ user_id: auth.user.id, post_id: v.data }, { onConflict: "user_id,post_id", ignoreDuplicates: true })
    : await auth.supabase.from("muted_threads").delete().eq("user_id", auth.user.id).eq("post_id", v.data);
  if (error) return fail(toErrorCode(error));
  return ok({ muted });
}
