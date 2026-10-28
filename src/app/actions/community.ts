"use server";

import { revalidatePath } from "next/cache";
import { REPLY_PAGE_SIZE } from "@/lib/constants";
import { authenticate, notAuthenticated, validate } from "@/lib/action-utils";
import { getViewerProfile } from "@/lib/auth";
import { fail, ok, toErrorCode, type ActionResult } from "@/lib/errors";
import type { PostCursor, ReactionState, ReplyRow } from "@/lib/types";
import { editReplySchema, reactionSchema, replySchema, uuidSchema } from "@/lib/validation";
import { z } from "zod";
import { schedulePushDelivery } from "@/lib/push/server";

/**
 * Sets, changes or removes the user's reaction. Returns the persisted counts,
 * which the client uses to replace its optimistic state.
 */
export async function setReactionAction(input: unknown): Promise<ActionResult<ReactionState>> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(reactionSchema, input);
  if (!v.success) return v.result;

  const { data, error } = await auth.supabase.rpc("set_reaction", {
    p_target_type: v.data.targetType,
    p_target_id: v.data.targetId,
    p_reaction: v.data.reaction,
  });
  if (error) return fail(toErrorCode(error));
  schedulePushDelivery();
  const row = ((data ?? []) as ReactionState[])[0];
  if (!row) return fail("not_found");
  return ok({ reactions: row.reactions ?? {}, my_reaction: row.my_reaction ?? null });
}

const loadRepliesSchema = z.object({
  postId: uuidSchema,
  cursor: z.object({ at: z.iso.datetime({ offset: true }), id: uuidSchema }).nullable(),
});

export async function loadRepliesAction(input: unknown): Promise<ActionResult<{ replies: ReplyRow[]; nextCursor: PostCursor | null }>> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(loadRepliesSchema, input);
  if (!v.success) return v.result;

  const { data, error } = await auth.supabase.rpc("get_post_replies", {
    p_post_id: v.data.postId,
    p_limit: REPLY_PAGE_SIZE,
    p_cursor_at: v.data.cursor?.at ?? null,
    p_cursor_id: v.data.cursor?.id ?? null,
  });
  if (error) return fail(toErrorCode(error));
  const replies = (data ?? []) as ReplyRow[];
  const last = replies.at(-1);
  return ok({
    replies,
    nextCursor: replies.length === REPLY_PAGE_SIZE && last ? { at: last.created_at, id: last.id } : null,
  });
}

export async function createReplyAction(input: unknown): Promise<ActionResult<ReplyRow>> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(replySchema, input);
  if (!v.success) return v.result;

  const { data, error } = await auth.supabase
    .from("replies")
    .insert({
      post_id: v.data.postId,
      author_id: auth.user.id,
      parent_reply_id: v.data.parentReplyId ?? null,
      content: v.data.content,
    })
    .select("id, created_at")
    .single();
  if (error) return fail(toErrorCode(error));
  schedulePushDelivery();

  const profile = await getViewerProfile();
  revalidatePath(`/post/${v.data.postId}`);
  return ok({
    id: data.id as string,
    parent_reply_id: v.data.parentReplyId ?? null,
    content: v.data.content,
    status: "active",
    created_at: data.created_at as string,
    edited_at: null,
    author_handle: profile?.handle ?? "",
    author_display_name: profile?.display_name ?? "",
    author_avatar_key: profile?.avatar_key ?? "leaf",
    author_avatar_path: profile?.avatar_path ?? null,
    author_verified: profile?.is_verified ?? false,
    is_mine: true,
    is_post_author: Boolean(v.data.isPostAuthor),
    reactions: {},
    my_reaction: null,
  });
}

export async function editReplyAction(input: unknown): Promise<ActionResult<{ content: string }>> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(editReplySchema, input);
  if (!v.success) return v.result;

  const { data, error } = await auth.supabase
    .from("replies")
    .update({ content: v.data.content })
    .eq("id", v.data.replyId)
    .eq("author_id", auth.user.id)
    .select("id");
  if (error) return fail(toErrorCode(error));
  if (!data?.length) return fail("not_found");
  return ok({ content: v.data.content });
}

export async function deleteReplyAction(replyId: string): Promise<ActionResult> {
  const auth = await authenticate();
  if (!auth) return notAuthenticated();
  const v = validate(uuidSchema, replyId);
  if (!v.success) return v.result;

  const { data, error } = await auth.supabase
    .from("replies")
    .delete()
    .eq("id", v.data)
    .eq("author_id", auth.user.id)
    .select("id");
  if (error) return fail(toErrorCode(error));
  if (!data?.length) return fail("not_found");
  return ok(null);
}
