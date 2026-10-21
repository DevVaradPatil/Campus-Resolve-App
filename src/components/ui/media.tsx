"use client";

/* eslint-disable @next/next/no-img-element -- attachment URLs are short-lived signed URLs; the
   Next image optimizer would cache them past expiry. */

import clsx from "clsx";
import { ImagePlus, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTrigger } from "./overlay";

/** Thumbnail that opens the full image. `alt` describes the photo, not "photo". */
export function Thumbnail({
  src,
  alt,
  size = "md",
}: {
  src: string;
  alt: string;
  size?: "sm" | "md";
}) {
  return (
    <Dialog>
      <DialogTrigger
        className={clsx(
          "shrink-0 overflow-hidden rounded-thumb border border-rule bg-sheet-sunk",
          size === "sm" ? "size-16" : "size-24",
        )}
        aria-label={`View photo: ${alt}`}
      >
        <img src={src} alt="" className="size-full object-cover" loading="lazy" />
      </DialogTrigger>
      <DialogContent title="Photo" description={alt} variant="center" className="max-w-3xl">
        <img src={src} alt={alt} className="max-h-[70dvh] w-full rounded-thumb object-contain" />
      </DialogContent>
    </Dialog>
  );
}

export type UploadItem = {
  id: string;
  name: string;
  previewUrl?: string;
  /** 0–100 while uploading; undefined once done */
  progress?: number;
  error?: string;
};

/** Photo picker. Validation (type, size, count) is decided by the caller and passed back as `error`. */
export function UploadDropzone({
  items,
  maxFiles,
  maxMb,
  onAdd,
  onRemove,
}: {
  items: UploadItem[];
  maxFiles: number;
  maxMb: number;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const full = items.length >= maxFiles;

  return (
    <div className="flex flex-col gap-3">
      {!full && (
        <label
          htmlFor={id}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            onAdd([...e.dataTransfer.files]);
          }}
          className={clsx(
            "flex cursor-pointer flex-col items-center gap-1 rounded-control border-2 border-dashed px-4 py-6 text-center",
            "has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink",
            drag ? "border-ink bg-ink-soft" : "border-line-strong bg-sheet",
          )}
        >
          <ImagePlus aria-hidden className="size-7 text-ink" strokeWidth={1.75} />
          <span className="font-semibold text-ink">Add photos</span>
          <span className="text-sm text-muted">
            JPEG, PNG or WebP, up to {maxFiles} photos of {maxMb} MB each
          </span>
          <input
            ref={input}
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            onChange={(e) => {
              onAdd([...(e.target.files ?? [])]);
              if (input.current) input.current.value = "";
            }}
          />
        </label>
      )}
      {items.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Selected photos">
          {items.map((it) => (
            <li
              key={it.id}
              className={clsx(
                "flex items-center gap-3 rounded-control border p-2",
                it.error ? "border-danger bg-danger-soft" : "border-rule bg-sheet",
              )}
            >
              <div className="size-12 shrink-0 overflow-hidden rounded-thumb bg-sheet-sunk">
                {it.previewUrl && (
                  <img src={it.previewUrl} alt="" className="size-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{it.name}</p>
                {it.error ? (
                  <p className="text-sm text-danger">{it.error}</p>
                ) : it.progress !== undefined ? (
                  <progress
                    value={it.progress}
                    max={100}
                    aria-label={`Uploading ${it.name}`}
                    className="h-1.5 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-ink [&::-webkit-progress-bar]:bg-sheet-sunk [&::-webkit-progress-value]:bg-ink"
                  />
                ) : (
                  <p className="text-sm text-success">Ready</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onRemove(it.id)}
                aria-label={`Remove ${it.name}`}
                className="grid size-11 shrink-0 place-items-center rounded-control text-muted hover:bg-sheet-sunk"
              >
                <X aria-hidden className="size-5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
