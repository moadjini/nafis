"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { toast } from "sonner";
import { updatePostAction } from "@/app/actions/posts";
import { LIMITS, type ContentLanguage, type ResponsePreference, type Topic } from "@/lib/constants";
import { mightIndicateCrisis } from "@/lib/crisis";
import { errorMessage } from "@/lib/errors";
import { useI18n } from "@/lib/i18n/client";
import type { PostRow } from "@/lib/types";
import { interpolate } from "@/lib/utils";
import { AudioPlayer } from "@/components/posts/audio-player";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import { Notice } from "@/components/ui/misc";
import { CrisisNotice, ResponsePreferenceField, TopicLanguageFields } from "./post-meta-fields";

export function EditPostForm({ post }: { post: PostRow }) {
  const { t } = useI18n();
  const router = useRouter();
  const [content, setContent] = useState(post.content ?? "");
  const [caption, setCaption] = useState(post.caption ?? "");
  const [topic, setTopic] = useState<Topic | null>(post.topic);
  const [language, setLanguage] = useState<ContentLanguage>(post.language);
  const [preference, setPreference] = useState<ResponsePreference>(post.response_preference);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isDraft = post.visibility === "draft";

  function save(publish: boolean) {
    setError(null);
    if (post.post_type === "text" && !content.trim()) return setError(t.composer.emptyError);
    startTransition(async () => {
      const result = await updatePostAction({
        postId: post.id,
        content: post.post_type === "text" ? content.trim() : undefined,
        caption: caption.trim() || undefined,
        topic,
        language,
        responsePreference: preference,
        publish,
      });
      if (!result.ok) return setError(errorMessage(t, result.error));
      toast.success(publish ? t.composer.published : t.composer.updated);
      router.push(`/post/${post.id}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <Field label={t.composer.captionLabel} htmlFor="caption" optional={t.common.optional}>
        <Input id="caption" value={caption} maxLength={LIMITS.caption} onChange={(e) => setCaption(e.target.value)} placeholder={t.composer.captionPlaceholder} />
      </Field>

      {post.post_type === "text" ? (
        <div>
          <label htmlFor="content" className="sr-only">
            {t.composer.textLabel}
          </label>
          <Textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={LIMITS.postContent}
            className="min-h-56 rounded-3xl bg-primary-faint/50 px-5 py-4 text-base"
          />
          <p className="mt-2 text-right text-xs tabular-nums text-muted-foreground">
            {interpolate(t.common.characters, { count: content.length, max: LIMITS.postContent })}
          </p>
        </div>
      ) : (
        <>
          <AudioPlayer postId={post.id} durationSeconds={post.audio_duration_seconds ?? 0} />
          <Notice icon={Info} tone="neutral">
            {t.composer.voiceEditNote}
          </Notice>
        </>
      )}

      {mightIndicateCrisis(`${content}\n${caption}`) ? <CrisisNotice /> : null}

      <TopicLanguageFields topic={topic} language={language} onTopic={setTopic} onLanguage={setLanguage} />
      <ResponsePreferenceField value={preference} onChange={setPreference} />

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
          {t.common.cancel}
        </Button>
        <Button type="button" variant={isDraft ? "secondary" : "primary"} onClick={() => save(false)} loading={pending}>
          {isDraft ? t.composer.saveDraft : t.common.save}
        </Button>
        {isDraft ? (
          <Button type="button" onClick={() => save(true)} disabled={pending}>
            {t.composer.publish}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
