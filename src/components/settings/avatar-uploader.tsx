"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Info, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { removeAvatarAction, uploadAvatarAction } from "@/app/actions/avatar";
import { AVATAR_UPLOAD, type AvatarKey } from "@/lib/constants";
import { errorMessage } from "@/lib/errors";
import { useI18n } from "@/lib/i18n/client";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/misc";

const VIEWPORT = 280; // crop area in CSS pixels
const OUTPUT = 512;

type Loaded = { url: string; img: HTMLImageElement };
type View = { zoom: number; x: number; y: number };

function clampView(view: View, img: HTMLImageElement): View {
  const scale = (VIEWPORT / Math.min(img.naturalWidth, img.naturalHeight)) * view.zoom;
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  return {
    zoom: view.zoom,
    x: Math.min(0, Math.max(VIEWPORT - w, view.x)),
    y: Math.min(0, Math.max(VIEWPORT - h, view.y)),
  };
}

function centred(img: HTMLImageElement, zoom = 1): View {
  const scale = (VIEWPORT / Math.min(img.naturalWidth, img.naturalHeight)) * zoom;
  return { zoom, x: (VIEWPORT - img.naturalWidth * scale) / 2, y: (VIEWPORT - img.naturalHeight * scale) / 2 };
}

/** Crops in the browser; the server still decodes and re-encodes the result. */
async function exportCrop(img: HTMLImageElement, view: View): Promise<Blob | null> {
  const scale = (VIEWPORT / Math.min(img.naturalWidth, img.naturalHeight)) * view.zoom;
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, -view.x / scale, -view.y / scale, VIEWPORT / scale, VIEWPORT / scale, 0, 0, OUTPUT, OUTPUT);
  for (const quality of [0.9, 0.8, 0.65]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (blob && blob.size <= AVATAR_UPLOAD.maxBytes) return blob;
  }
  return null;
}

export function AvatarUploader({ name, avatarKey, avatarPath }: { name: string; avatarKey: AvatarKey; avatarPath: string | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; view: View } | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => () => {
    if (loaded) URL.revokeObjectURL(loaded.url);
  }, [loaded]);

  function pick(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!(AVATAR_UPLOAD.acceptedMimeTypes as readonly string[]).includes(file.type)) return setError(t.avatarUpload.errors.type);
    if (file.size > AVATAR_UPLOAD.sourceMaxBytes) return setError(t.avatarUpload.errors.size);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth < 64 || img.naturalHeight < 64) {
        URL.revokeObjectURL(url);
        setError(t.avatarUpload.errors.small);
        return;
      }
      setView(centred(img));
      setLoaded({ url, img });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError(t.avatarUpload.errors.unreadable);
    };
    img.src = url;
  }

  function setZoom(zoom: number) {
    if (!loaded) return;
    const { img } = loaded;
    // Keep the point under the viewport centre fixed while zooming.
    const oldScale = (VIEWPORT / Math.min(img.naturalWidth, img.naturalHeight)) * view.zoom;
    const newScale = (VIEWPORT / Math.min(img.naturalWidth, img.naturalHeight)) * zoom;
    const cx = (VIEWPORT / 2 - view.x) / oldScale;
    const cy = (VIEWPORT / 2 - view.y) / oldScale;
    setView(clampView({ zoom, x: VIEWPORT / 2 - cx * newScale, y: VIEWPORT / 2 - cy * newScale }, img));
  }

  function nudge(dx: number, dy: number) {
    if (loaded) setView((v) => clampView({ ...v, x: v.x + dx, y: v.y + dy }, loaded.img));
  }

  function save() {
    if (!loaded) return;
    startTransition(async () => {
      const blob = await exportCrop(loaded.img, view);
      if (!blob) {
        setError(t.avatarUpload.errors.unreadable);
        return;
      }
      const form = new FormData();
      form.set("avatar", new File([blob], "avatar.webp", { type: blob.type || "image/webp" }));
      const result = await uploadAvatarAction(form);
      if (result.ok) {
        toast.success(t.avatarUpload.saved);
        setLoaded(null);
        router.refresh();
      } else {
        toast.error(errorMessage(t, result.error));
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await removeAvatarAction();
      if (result.ok) {
        toast.success(t.avatarUpload.removed);
        router.refresh();
      } else toast.error(errorMessage(t, result.error));
    });
  }

  const scale = loaded ? (VIEWPORT / Math.min(loaded.img.naturalWidth, loaded.img.naturalHeight)) * view.zoom : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar avatarKey={avatarKey} avatarPath={avatarPath} name={name} size="xl" className="ring-4 ring-primary-faint" />
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={AVATAR_UPLOAD.acceptedMimeTypes.join(",")}
            className="sr-only"
            tabIndex={-1}
            aria-label={t.avatarUpload.upload}
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()} disabled={pending}>
            <ImagePlus aria-hidden /> {avatarPath ? t.avatarUpload.change : t.avatarUpload.upload}
          </Button>
          {avatarPath ? (
            <Button type="button" variant="destructive-ghost" size="sm" onClick={remove} disabled={pending}>
              <Trash2 aria-hidden /> {t.avatarUpload.remove}
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t.avatarUpload.hint}</p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Notice icon={Info} tone="neutral">
        {t.avatarUpload.visibilityNote}
      </Notice>

      <Dialog open={loaded !== null} onOpenChange={(open) => !open && setLoaded(null)}>
        <DialogContent closeLabel={t.common.close}>
          <DialogHeader title={t.avatarUpload.cropTitle} description={t.avatarUpload.cropHelp} />
          {loaded ? (
            <div className="flex flex-col items-center gap-5">
              <div
                role="application"
                aria-label={t.avatarUpload.cropHelp}
                tabIndex={0}
                className="relative cursor-grab touch-none overflow-hidden rounded-2xl bg-muted outline-none focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing"
                style={{ width: VIEWPORT, height: VIEWPORT }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  dragRef.current = { x: e.clientX, y: e.clientY, view };
                }}
                onPointerMove={(e) => {
                  const start = dragRef.current;
                  if (!start) return;
                  setView(clampView({ ...start.view, x: start.view.x + e.clientX - start.x, y: start.view.y + e.clientY - start.y }, loaded.img));
                }}
                onPointerUp={() => {
                  dragRef.current = null;
                }}
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 20 : 6;
                  if (e.key === "ArrowLeft") nudge(step, 0);
                  else if (e.key === "ArrowRight") nudge(-step, 0);
                  else if (e.key === "ArrowUp") nudge(0, step);
                  else if (e.key === "ArrowDown") nudge(0, -step);
                  else return;
                  e.preventDefault();
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                <img
                  src={loaded.url}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute left-0 top-0 max-w-none select-none"
                  style={{
                    width: loaded.img.naturalWidth * scale,
                    height: loaded.img.naturalHeight * scale,
                    transform: `translate(${view.x}px, ${view.y}px)`,
                  }}
                />
                {/* Circular guide: everything outside the circle is dimmed. */}
                <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgba(14,23,17,0.45)] ring-2 ring-white/90" />
              </div>
              <label className="flex w-full max-w-[280px] items-center gap-3 text-sm">
                <span className="shrink-0 text-muted-foreground">{t.avatarUpload.zoom}</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={view.zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full accent-[var(--primary-strong)]"
                />
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLoaded(null)} disabled={pending}>
              {t.common.cancel}
            </Button>
            <Button onClick={save} loading={pending}>
              {pending ? t.avatarUpload.saving : t.avatarUpload.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
