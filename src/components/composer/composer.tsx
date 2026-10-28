"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Mic, PenLine, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { createTextPostAction, createVoicePostAction, discardUploadAction } from "@/app/actions/posts";
import { extensionFor } from "@/lib/audio";
import { mightIndicateCrisis } from "@/lib/crisis";
import { LIMITS, type ContentLanguage, type ResponsePreference, type Topic } from "@/lib/constants";
import { errorMessage } from "@/lib/errors";
import { useI18n } from "@/lib/i18n/client";
import { uploadVoiceNote } from "@/lib/upload";
import { cn, interpolate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form-controls";
import { Notice } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/safety/safety-dialogs";
import { CrisisNotice, ResponsePreferenceField, TopicLanguageFields } from "./post-meta-fields";
import { VoiceRecorder, type Recording } from "./voice-recorder";

type Mode = "text" | "voice";

export function Composer({
  initialMode,
  defaultLanguage,
  maxRecordingSeconds,
  prompt,
  draftCount,
}: {
  initialMode: Mode;
  defaultLanguage: ContentLanguage;
  maxRecordingSeconds: number;
  prompt: string | null;
  draftCount: number;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [content, setContent] = useState("");
  const [caption, setCaption] = useState("");
  const [topic, setTopic] = useState<Topic | null>(null);
  const [language, setLanguage] = useState<ContentLanguage>(defaultLanguage);
  const [preference, setPreference] = useState<ResponsePreference>("just_listen");
  const [recording, setRecording] = useState<Recording | null>(null);
  const [uploaded, setUploaded] = useState<{ blob: Blob; path: string } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [pending, startTransition] = useTransition();
  const submittedRef = useRef(false);

  const dirty = content.trim().length > 0 || caption.trim().length > 0 || recording !== null;
  const showCrisis = useMemo(() => mightIndicateCrisis(`${content}\n${caption}`), [content, caption]);

  // Warn before closing the tab with unsent work.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      if (submittedRef.current) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function changeRecording(next: Recording | null) {
    // A new or removed recording invalidates any earlier upload.
    if (uploaded && uploaded.blob !== next?.blob) {
      void discardUploadAction(uploaded.path);
      setUploaded(null);
    }
    setUploadFailed(false);
    setProgress(null);
    setRecording(next);
  }

  async function ensureUploaded(rec: Recording): Promise<string | null> {
    if (uploaded && uploaded.blob === rec.blob) return uploaded.path;
    const path = `${crypto.randomUUID()}.${extensionFor(rec.mimeType)}`;
    setUploadFailed(false);
    setProgress(0);
    const result = await uploadVoiceNote(rec.blob, path, rec.mimeType, setProgress);
    if (!result.ok) {
      setProgress(null);
      setUploadFailed(true);
      return null;
    }
    setUploaded({ blob: rec.blob, path });
    return path;
  }

  function submit(asDraft: boolean) {
    setError(null);
    if (mode === "text") {
      const value = content.trim();
      if (!value) return setError(t.composer.emptyError);
      if (value.length > LIMITS.postContent) return setError(interpolate(t.composer.tooLong, { max: LIMITS.postContent }));
    } else if (!recording) {
      return setError(t.composer.needRecording);
    }

    startTransition(async () => {
      const common = { topic, language, responsePreference: preference, asDraft, caption: caption.trim() || undefined };
      let result;
      if (mode === "text") {
        result = await createTextPostAction({ ...common, content: content.trim() });
      } else {
        const path = await ensureUploaded(recording!);
        if (!path) return;
        result = await createVoicePostAction({
          ...common,
          audioPath: path,
          audioMimeType: recording!.mimeType,
          durationSeconds: recording!.durationSeconds,
        });
      }

      if (!result.ok) {
        setError(errorMessage(t, result.error));
        return;
      }
      submittedRef.current = true;
      toast.success(asDraft ? t.composer.draftSaved : t.composer.published);
      router.push(`/post/${result.data.id}`);
    });
  }

  function leave() {
    if (uploaded) void discardUploadAction(uploaded.path);
    submittedRef.current = true;
    router.push("/home");
  }

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label={t.composer.title} className="inline-flex rounded-full bg-muted p-1">
        {(["text", "voice"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            aria-controls={`composer-${m}`}
            onClick={() => setMode(m)}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm transition-colors",
              mode === m ? "bg-surface font-medium text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "text" ? <PenLine className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
            {m === "text" ? t.composer.tabText : t.composer.tabVoice}
          </button>
        ))}
      </div>

      {prompt ? (
        <p className="rounded-2xl border border-dashed border-primary/40 px-4 py-3 text-sm text-primary-text">{prompt}</p>
      ) : null}

      <div id={`composer-${mode}`} role="tabpanel" className="space-y-5">
        {mode === "text" ? (
          <>
            <Field label={t.composer.captionLabel} htmlFor="caption" optional={t.common.optional}>
              <Input
                id="caption"
                value={caption}
                maxLength={LIMITS.caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={t.composer.captionPlaceholder}
              />
            </Field>
            <div className="flex flex-col gap-2">
              <label htmlFor="content" className="sr-only">
                {t.composer.textLabel}
              </label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t.composer.textPlaceholder}
                maxLength={LIMITS.postContent}
                className="min-h-56 rounded-3xl bg-primary-faint/50 px-5 py-4 text-base"
                aria-describedby="content-count"
                autoFocus
              />
              <p id="content-count" className="text-right text-xs tabular-nums text-muted-foreground">
                {interpolate(t.common.characters, { count: content.length, max: LIMITS.postContent })}
              </p>
            </div>
          </>
        ) : (
          <>
            <VoiceRecorder maxSeconds={maxRecordingSeconds} recording={recording} onChange={changeRecording} disabled={pending} />
            <Field label={t.composer.captionLabel} htmlFor="caption" optional={t.common.optional}>
              <Input
                id="caption"
                value={caption}
                maxLength={LIMITS.caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={t.composer.captionPlaceholder}
              />
            </Field>
          </>
        )}

        {showCrisis ? <CrisisNotice /> : null}

        <TopicLanguageFields topic={topic} language={language} onTopic={setTopic} onLanguage={setLanguage} />
        <ResponsePreferenceField value={preference} onChange={setPreference} />

        {mode === "text" && content.trim() ? (
          <div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowPreview((s) => !s)} aria-expanded={showPreview}>
              {showPreview ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              {showPreview ? t.common.hidePreview : t.common.preview}
            </Button>
            {showPreview ? (
              <div className="mt-3 rounded-3xl border border-border p-5">
                <p className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">{t.composer.previewHeading}</p>
                {caption.trim() ? <p className="mb-2 text-[1.05rem] font-medium">{caption.trim()}</p> : null}
                <p className="prose-nafis">{content.trim()}</p>
                <p className="mt-3 text-xs text-primary-text">{t.responsePrefs[preference].short}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        <Notice icon={ShieldCheck} tone="neutral">
          {t.composer.privacyReminder} {t.composer.visibilityNote}
        </Notice>

        {progress !== null && pending ? (
          <div aria-live="polite">
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{interpolate(t.recorder.uploading, { percent: progress })}</p>
          </div>
        ) : null}
        {uploadFailed ? (
          <p role="alert" className="text-sm text-destructive">
            {t.recorder.uploadFailed}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <Button type="button" variant="ghost" onClick={() => (dirty ? setConfirmLeave(true) : router.back())} disabled={pending}>
              {t.common.cancel}
            </Button>
            {draftCount > 0 ? (
              <Link href="/profile/me#drafts" className="px-2 text-center text-sm text-muted-foreground hover:text-primary-text">
                {interpolate(t.composer.draftsCount, { count: draftCount })}
              </Link>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="secondary" onClick={() => submit(true)} disabled={pending}>
              {t.composer.saveDraft}
            </Button>
            <Button type="button" onClick={() => submit(false)} loading={pending}>
              {uploadFailed ? t.recorder.retryUpload : pending ? t.composer.publishing : t.composer.publish}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title={t.composer.discardTitle}
        body={t.composer.discardBody}
        confirmLabel={t.composer.discard}
        onConfirm={leave}
      />
    </div>
  );
}
