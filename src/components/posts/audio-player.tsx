"use client";

import { useRef, useState } from "react";
import { Loader2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { getAudioUrlAction } from "@/app/actions/posts";
import { useI18n } from "@/lib/i18n/client";
import { cn, formatDuration, interpolate } from "@/lib/utils";

type Props = {
  /** Fetches a signed URL lazily on first play (for published posts). */
  postId?: string;
  /** Or play a local blob URL (composer preview). */
  src?: string;
  durationSeconds: number;
  label?: string;
  className?: string;
};

/**
 * Accessible audio player. Never autoplays. For posts, the short-lived signed
 * URL is requested only when the listener presses play, and re-requested if it
 * has expired.
 */
export function AudioPlayer({ postId, src, durationSeconds, label, className }: Props) {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const url = src ?? signedUrl;
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "paused" | "error">("idle");
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(durationSeconds);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  async function ensureUrl(force = false) {
    if (url && !force) return url;
    if (!postId) return null;
    const result = await getAudioUrlAction(postId);
    if (!result.ok) return null;
    setSignedUrl(result.data.url);
    return result.data.url;
  }

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (status === "playing") {
      audio.pause();
      return;
    }
    setStatus("loading");
    const resolved = await ensureUrl();
    if (!resolved) {
      setStatus("error");
      return;
    }
    if (audio.src !== resolved) audio.src = resolved;
    try {
      await audio.play();
    } catch {
      // Expired link or decode error: try once more with a fresh URL.
      const fresh = postId ? await ensureUrl(true) : null;
      if (!fresh) {
        setStatus("error");
        return;
      }
      audio.src = fresh;
      try {
        await audio.play();
      } catch {
        setStatus("error");
      }
    }
  }

  const progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
  const playLabel = label ? `${t.audio.play}: ${label}` : t.audio.play;

  return (
    <div className={cn("flex items-center gap-3 rounded-2xl bg-primary-faint p-3", className)}>
      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => setStatus("playing")}
        onPause={() => setStatus((s) => (s === "error" ? s : "paused"))}
        onEnded={() => {
          setStatus("paused");
          setCurrent(0);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration);
        }}
        onWaiting={() => setStatus("loading")}
        onPlaying={() => setStatus("playing")}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={status === "playing" ? t.audio.pause : playLabel}
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-strong text-white transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {status === "loading" ? (
          <Loader2 className="size-5 animate-spin" aria-hidden />
        ) : status === "playing" ? (
          <Pause className="size-5" aria-hidden fill="currentColor" />
        ) : (
          <Play className="ml-0.5 size-5" aria-hidden fill="currentColor" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        {status === "error" ? (
          <p role="alert" className="text-sm text-destructive">
            {t.audio.error}
          </p>
        ) : (
          <>
            <input
              type="range"
              min={0}
              max={Math.max(1, Math.round(duration))}
              step={1}
              value={Math.round(current)}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (audioRef.current && audioRef.current.src) audioRef.current.currentTime = value;
                setCurrent(value);
              }}
              aria-label={t.audio.seek}
              aria-valuetext={`${formatDuration(current)} / ${formatDuration(duration)}`}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-primary-soft accent-[var(--primary-strong)]"
              style={{ background: `linear-gradient(to right, var(--primary) ${progress}%, var(--primary-soft) ${progress}%)` }}
            />
            <div className="mt-1.5 flex justify-between text-xs tabular-nums text-muted-foreground">
              <span>{formatDuration(current)}</span>
              <span aria-label={interpolate(t.audio.duration, { time: formatDuration(duration) })}>{formatDuration(duration)}</span>
            </div>
          </>
        )}
      </div>

      <div className="hidden items-center gap-1 sm:flex">
        <button
          type="button"
          onClick={() => {
            const next = !muted;
            setMuted(next);
            if (audioRef.current) audioRef.current.muted = next;
          }}
          aria-label={muted ? t.audio.unmute : t.audio.mute}
          aria-pressed={muted}
          className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-primary-soft hover:text-foreground"
        >
          {muted ? <VolumeX className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(e) => {
            const value = Number(e.target.value);
            setVolume(value);
            setMuted(value === 0);
            if (audioRef.current) {
              audioRef.current.volume = value;
              audioRef.current.muted = value === 0;
            }
          }}
          aria-label={t.audio.volume}
          className="h-1.5 w-16 cursor-pointer accent-[var(--primary-strong)]"
        />
      </div>
    </div>
  );
}
