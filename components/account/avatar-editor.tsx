'use client';

import {
  Check,
  Loader2,
  Move,
  RotateCcw,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

const EDITOR_SIZE = 288;
const OUTPUT_SIZE = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const OUTPUT_MAX_BYTES = 2 * 1024 * 1024;

type Point = { x: number; y: number };
type Dimensions = { width: number; height: number };

type AvatarEditorProps = {
  file: File | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (file: File) => Promise<boolean> | boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function rotatedDimensions(dimensions: Dimensions, rotation: number) {
  return rotation % 180 === 0
    ? dimensions
    : { width: dimensions.height, height: dimensions.width };
}

function geometryFor(
  dimensions: Dimensions,
  rotation: number,
  zoom: number,
) {
  const rotated = rotatedDimensions(dimensions, rotation);
  const coverScale = Math.max(
    EDITOR_SIZE / rotated.width,
    EDITOR_SIZE / rotated.height,
  );
  const scale = coverScale * zoom;
  const boundsWidth = rotated.width * scale;
  const boundsHeight = rotated.height * scale;

  return {
    coverScale,
    scale,
    maxOffsetX: Math.max(0, (boundsWidth - EDITOR_SIZE) / 2),
    maxOffsetY: Math.max(0, (boundsHeight - EDITOR_SIZE) / 2),
  };
}

function clampOffset(
  point: Point,
  dimensions: Dimensions,
  rotation: number,
  zoom: number,
) {
  const geometry = geometryFor(dimensions, rotation, zoom);
  return {
    x: clamp(point.x, -geometry.maxOffsetX, geometry.maxOffsetX),
    y: clamp(point.y, -geometry.maxOffsetY, geometry.maxOffsetY),
  };
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Unable to prepare the cropped image.'));
      },
      type,
      quality,
    );
  });
}

export function AvatarEditor({
  file,
  busy,
  onCancel,
  onSave,
}: AvatarEditorProps) {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<Dimensions | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [preparing, setPreparing] = useState(false);

  const imageRef = useRef<HTMLImageElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    offset: Point;
  } | null>(null);

  useEffect(() => {
    if (!file) {
      setSourceUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setSourceUrl(nextUrl);
    setDimensions(null);
    setZoom(MIN_ZOOM);
    setRotation(0);
    setOffset({ x: 0, y: 0 });

    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  useEffect(() => {
    if (!file) return;
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy && !preparing) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [file, busy, preparing, onCancel]);

  const geometry = useMemo(() => {
    if (!dimensions) return null;
    return geometryFor(dimensions, rotation, zoom);
  }, [dimensions, rotation, zoom]);

  const renderedSize = useMemo(() => {
    if (!dimensions || !geometry) return null;
    return {
      width: dimensions.width * geometry.scale,
      height: dimensions.height * geometry.scale,
    };
  }, [dimensions, geometry]);

  if (!file || !sourceUrl) return null;

  const locked = busy || preparing;

  function changeZoom(nextZoom: number) {
    if (!dimensions) return;
    const value = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    setZoom(value);
    setOffset((current) =>
      clampOffset(current, dimensions, rotation, value),
    );
  }

  function rotate(delta: number) {
    const nextRotation = (rotation + delta + 360) % 360;
    setRotation(nextRotation);
    setOffset({ x: 0, y: 0 });
  }

  function resetEditor() {
    setZoom(MIN_ZOOM);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (locked || !dimensions) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offset,
    };
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !dimensions) return;
    const next = {
      x: drag.offset.x + event.clientX - drag.startX,
      y: drag.offset.y + event.clientY - drag.startY,
    };
    setOffset(clampOffset(next, dimensions, rotation, zoom));
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  async function saveCrop() {
    const image = imageRef.current;
    if (!image || !dimensions || !geometry) return;

    setPreparing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to prepare the cropped image.');

      const outputScale = OUTPUT_SIZE / EDITOR_SIZE;
      context.translate(
        OUTPUT_SIZE / 2 + offset.x * outputScale,
        OUTPUT_SIZE / 2 + offset.y * outputScale,
      );
      context.rotate((rotation * Math.PI) / 180);
      context.scale(
        geometry.scale * outputScale,
        geometry.scale * outputScale,
      );
      context.drawImage(
        image,
        -dimensions.width / 2,
        -dimensions.height / 2,
        dimensions.width,
        dimensions.height,
      );

      let blob = await canvasBlob(canvas, 'image/webp', 0.9);
      let type = 'image/webp';
      let fileName = 'avatar.webp';

      if (blob.size > OUTPUT_MAX_BYTES) {
        blob = await canvasBlob(canvas, 'image/jpeg', 0.86);
        type = 'image/jpeg';
        fileName = 'avatar.jpg';
      }
      if (blob.size > OUTPUT_MAX_BYTES) {
        throw new Error('The cropped image is still too large. Try zooming in more.');
      }

      const saved = await onSave(new File([blob], fileName, { type }));
      if (saved) onCancel();
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !locked) onCancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-editor-title"
        aria-describedby="avatar-editor-description"
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-950 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="avatar-editor-title"
              className="text-lg font-semibold text-[color:var(--dp-navy)] dark:text-slate-100"
            >
              Adjust profile picture
            </h2>
            <p
              id="avatar-editor-description"
              className="mt-1 text-sm text-slate-500 dark:text-slate-400"
            >
              Drag to reposition, then use zoom or rotation to frame your picture.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close profile picture editor"
            disabled={locked}
            onClick={onCancel}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-6 flex justify-center">
          <div
            className="relative size-72 cursor-grab touch-none overflow-hidden rounded-full bg-slate-100 shadow-inner ring-4 ring-white active:cursor-grabbing dark:bg-slate-900 dark:ring-slate-800"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={sourceUrl}
              alt="Profile picture crop preview"
              draggable={false}
              onLoad={(event) => {
                const next = {
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                };
                setDimensions(next);
                setOffset({ x: 0, y: 0 });
              }}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
              style={
                renderedSize
                  ? {
                      width: renderedSize.width,
                      height: renderedSize.height,
                      marginLeft: -renderedSize.width / 2,
                      marginTop: -renderedSize.height / 2,
                      transform: `translate3d(${offset.x}px, ${offset.y}px, 0) rotate(${rotation}deg)`,
                    }
                  : undefined
              }
            />
            {!dimensions && (
              <div className="absolute inset-0 grid place-items-center">
                <Loader2 className="size-6 animate-spin text-slate-500" />
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/15" />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Move className="size-3.5" /> Drag the image to choose what appears
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <ZoomOut className="size-4 shrink-0 text-slate-500" />
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step="0.01"
              value={zoom}
              disabled={locked || !dimensions}
              onChange={(event) => changeZoom(Number(event.target.value))}
              aria-label="Profile picture zoom"
              className="h-2 w-full cursor-pointer accent-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <ZoomIn className="size-4 shrink-0 text-slate-500" />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Rotate profile picture left"
                disabled={locked || !dimensions}
                onClick={() => rotate(-90)}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                <RotateCcw className="size-4" /> Left
              </button>
              <button
                type="button"
                aria-label="Rotate profile picture right"
                disabled={locked || !dimensions}
                onClick={() => rotate(90)}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                <RotateCw className="size-4" /> Right
              </button>
            </div>
            <button
              type="button"
              disabled={locked || !dimensions}
              onClick={resetEditor}
              className="h-9 rounded-md px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Reset
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={locked}
            onClick={onCancel}
            className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={locked || !dimensions}
            onClick={() => void saveCrop()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[color:var(--dp-navy)] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {locked ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            {locked ? 'Saving…' : 'Save profile picture'}
          </button>
        </div>
      </section>
    </div>
  );
}
