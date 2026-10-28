import { AUDIO, type AudioMimeType } from "@/lib/constants";

const EXTENSIONS: Record<AudioMimeType, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/aac": "aac",
};

/** Strips codec parameters ("audio/webm;codecs=opus" -> "audio/webm") and validates. */
export function normaliseAudioMime(raw: string | null | undefined): AudioMimeType | null {
  if (!raw) return null;
  const base = raw.split(";")[0]!.trim().toLowerCase();
  const aliased = base === "audio/x-mpeg" || base === "audio/mp3" ? "audio/mpeg" : base;
  return (AUDIO.mimeTypes as readonly string[]).includes(aliased) ? (aliased as AudioMimeType) : null;
}

export function extensionFor(mime: AudioMimeType) {
  return EXTENSIONS[mime];
}

/** The best MediaRecorder format this browser supports, or null. */
export function pickRecorderMimeType(): string | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return null;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

export function isRecordingSupported() {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    pickRecorderMimeType() !== null
  );
}

/** Reads an audio file's duration in seconds using the browser's decoder. */
export function readAudioDuration(file: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    const cleanup = () => URL.revokeObjectURL(url);
    audio.onloadedmetadata = () => {
      // Some WebM files report Infinity until fully scanned.
      if (Number.isFinite(audio.duration)) {
        cleanup();
        resolve(audio.duration);
        return;
      }
      audio.currentTime = Number.MAX_SAFE_INTEGER;
      audio.ontimeupdate = () => {
        audio.ontimeupdate = null;
        cleanup();
        resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
      };
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error("unreadable"));
    };
    audio.src = url;
  });
}
