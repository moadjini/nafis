"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, MicOff, Pause, Play, RotateCcw, Square, Trash2, Upload } from "lucide-react";
import { AUDIO, type AudioMimeType } from "@/lib/constants";
import { isRecordingSupported, normaliseAudioMime, pickRecorderMimeType, readAudioDuration } from "@/lib/audio";
import { useI18n } from "@/lib/i18n/client";
import { cn, formatDuration, interpolate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";
import { AudioPlayer } from "@/components/posts/audio-player";

export type Recording = { blob: Blob; mimeType: AudioMimeType; durationSeconds: number; url: string };

type Status = "idle" | "requesting" | "recording" | "paused" | "denied";

const BARS = 48;
const silentLevels = () => Array<number>(BARS).fill(0.04);
const noopSubscribe = () => () => undefined;
const supportsPause = () => typeof MediaRecorder !== "undefined" && "pause" in MediaRecorder.prototype;

/**
 * Records voice with MediaRecorder. The microphone is requested only when the
 * user presses Record and is released as soon as recording stops.
 */
export function VoiceRecorder({
  maxSeconds,
  recording,
  onChange,
  disabled,
}: {
  maxSeconds: number;
  recording: Recording | null;
  onChange: (recording: Recording | null) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status>("idle");
  const browserSupport = useSyncExternalStore(noopSubscribe, isRecordingSupported, () => true);
  const [forcedUnsupported, setForcedUnsupported] = useState(false);
  const supported = browserSupport && !forcedUnsupported;
  const canPause = useSyncExternalStore(noopSubscribe, supportsPause, () => false);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(silentLevels);
  const [message, setMessage] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const accumulatedRef = useRef(0);
  const frameRef = useRef<() => void>(() => undefined);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const releaseMic = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  useEffect(() => () => releaseMic(), [releaseMic]);

  function elapsedNow() {
    const running = recorderRef.current?.state === "recording" ? (performance.now() - startedAtRef.current) / 1000 : 0;
    return accumulatedRef.current + running;
  }

  /** Stops recording, counting the final running segment. */
  function finish() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    if (recorder.state === "recording") accumulatedRef.current += (performance.now() - startedAtRef.current) / 1000;
    recorder.stop();
  }

  // Animation loop: level meter + timer + auto-stop at the configured limit.
  useEffect(() => {
    frameRef.current = () => {
      const analyser = analyserRef.current;
      if (analyser && recorderRef.current?.state === "recording") {
        const data = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const value of data) {
          const v = (value - 128) / 128;
          sum += v * v;
        }
        const rms = Math.min(1, Math.sqrt(sum / data.length) * 3.2);
        setLevels((prev) => [...prev.slice(1), Math.max(0.04, rms)]);
      }
      const seconds = elapsedNow();
      setElapsed(seconds);
      if (seconds >= maxSeconds) {
        setMessage(interpolate(t.recorder.maxReached, { max: formatDuration(maxSeconds) }));
        finish();
        return;
      }
      rafRef.current = requestAnimationFrame(() => frameRef.current());
    };
  });

  async function start() {
    setMessage(null);
    const mimeType = pickRecorderMimeType();
    if (!mimeType) {
      setForcedUnsupported(true);
      return;
    }
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;

      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;

      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64_000 });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const duration = Math.min(maxSeconds, Math.round(accumulatedRef.current));
        const type = normaliseAudioMime(recorder.mimeType || mimeType) ?? "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        releaseMic();
        setStatus("idle");
        if (duration < 1 || blob.size === 0) {
          setMessage(t.recorder.tooShort);
          return;
        }
        onChange({ blob, mimeType: type, durationSeconds: duration, url: URL.createObjectURL(blob) });
      };

      recorderRef.current = recorder;
      accumulatedRef.current = 0;
      startedAtRef.current = performance.now();
      setLevels(silentLevels());
      setElapsed(0);
      recorder.start(1000);
      setStatus("recording");
      rafRef.current = requestAnimationFrame(() => frameRef.current());
    } catch {
      releaseMic();
      setStatus("denied");
    }
  }

  function pauseOrResume() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      accumulatedRef.current += (performance.now() - startedAtRef.current) / 1000;
      recorder.pause();
      setStatus("paused");
    } else if (recorder.state === "paused") {
      startedAtRef.current = performance.now();
      recorder.resume();
      setStatus("recording");
    }
  }

  async function handleFile(file: File | undefined) {
    setMessage(null);
    if (!file) return;
    const mime = normaliseAudioMime(file.type);
    if (!mime) return setMessage(t.recorder.fileUnsupported);
    if (file.size > AUDIO.maxBytes) return setMessage(t.recorder.fileTooBig);
    try {
      const seconds = await readAudioDuration(file);
      if (!seconds || seconds < 1) return setMessage(t.recorder.fileUnreadable);
      if (seconds > maxSeconds) return setMessage(interpolate(t.recorder.fileTooLong, { max: formatDuration(maxSeconds) }));
      onChange({ blob: file, mimeType: mime, durationSeconds: Math.round(seconds), url: URL.createObjectURL(file) });
    } catch {
      setMessage(t.recorder.fileUnreadable);
    }
  }

  function discard() {
    if (recording) URL.revokeObjectURL(recording.url);
    onChange(null);
    setElapsed(0);
    setLevels(silentLevels());
  }

  const active = status === "recording" || status === "paused";
  const remaining = Math.max(0, maxSeconds - elapsed);

  if (recording) {
    return (
      <div className="space-y-3 rounded-3xl border border-border bg-surface p-4 sm:p-5">
        <AudioPlayer src={recording.url} durationSeconds={recording.durationSeconds} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={discard} disabled={disabled}>
            <RotateCcw aria-hidden /> {t.recorder.rerecord}
          </Button>
          <Button type="button" variant="destructive-ghost" size="sm" onClick={discard} disabled={disabled}>
            <Trash2 aria-hidden /> {t.recorder.discard}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-border bg-surface p-5">
      <h3 className="sr-only">{t.recorder.title}</h3>

      {!supported ? (
        <Notice icon={MicOff} tone="neutral" className="mb-4">
          {t.recorder.unsupported}
        </Notice>
      ) : null}
      {status === "denied" ? (
        <Notice icon={MicOff} tone="danger" title={t.recorder.permissionTitle} className="mb-4">
          {t.recorder.permissionBody}
        </Notice>
      ) : null}

      {supported ? (
        <>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex items-center gap-2 font-medium" aria-live="polite">
              {active ? (
                <>
                  <span className={cn("size-2.5 rounded-full bg-destructive", status === "recording" && "animate-pulse-soft")} aria-hidden />
                  {status === "recording" ? t.recorder.recording : t.recorder.paused}
                </>
              ) : status === "requesting" ? (
                <span className="text-muted-foreground">{t.recorder.preparing}</span>
              ) : (
                <span className="text-xs font-normal text-muted-foreground">
                  {interpolate(t.recorder.uploadHint, { max: formatDuration(maxSeconds) })}
                </span>
              )}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatDuration(elapsed)} / {formatDuration(maxSeconds)}
              {active ? <span className="sr-only"> · {interpolate(t.recorder.remaining, { time: formatDuration(remaining) })}</span> : null}
            </span>
          </div>

          <div className="mt-4 flex h-16 items-center justify-center gap-[3px] rounded-2xl bg-primary-faint px-3" role="img" aria-label={t.recorder.levelLabel}>
            {levels.map((level, i) => (
              <span
                key={i}
                className={cn("w-[3px] rounded-full transition-[height] duration-75", active ? "bg-primary" : "bg-primary/30")}
                style={{ height: `${Math.round(6 + level * 50)}px` }}
              />
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            {!active ? (
              <Button type="button" size="lg" onClick={start} disabled={disabled || status === "requesting"} loading={status === "requesting"}>
                <Mic aria-hidden /> {t.recorder.start}
              </Button>
            ) : (
              <>
                {canPause ? (
                  <Button type="button" variant="outline" size="lg" onClick={pauseOrResume}>
                    {status === "paused" ? <Play aria-hidden /> : <Pause aria-hidden />}
                    {status === "paused" ? t.recorder.resume : t.recorder.pause}
                  </Button>
                ) : null}
                <Button type="button" size="lg" onClick={finish}>
                  <Square aria-hidden fill="currentColor" /> {t.recorder.stop}
                </Button>
              </>
            )}
          </div>
        </>
      ) : null}

      {!active ? (
        <div className="mt-4 border-t border-border pt-4 text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept={AUDIO.mimeTypes.join(",")}
            className="sr-only"
            id="audio-upload"
            tabIndex={-1}
            onChange={(e) => {
              void handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} disabled={disabled}>
            <Upload aria-hidden /> {t.recorder.upload}
          </Button>
        </div>
      ) : null}

      {message ? (
        <p role="status" className="mt-3 text-center text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}
