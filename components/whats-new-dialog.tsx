'use client';

import { Clock3, ListTree, X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

import { useWhatsNewController } from '@/components/whats-new/use-whats-new-controller';
import { WhatsNewHistory } from '@/components/whats-new/whats-new-history';
import { WhatsNewNavigation } from '@/components/whats-new/whats-new-navigation';
import { WhatsNewSlide } from '@/components/whats-new/whats-new-slide';
import { emitWhatsNewAnalytics } from '@/lib/whats-new-client';
import { WHATS_NEW_RELEASES } from '@/lib/whats-new';

type PointerStart = {
  x: number;
  y: number;
  target: EventTarget | null;
};

const FOCUSABLE = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function WhatsNewDialog({ autoOpen = true }: { autoOpen?: boolean }) {
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const slideFrameRef = useRef<HTMLDivElement | null>(null);
  const pointerStartRef = useRef<PointerStart | null>(null);

  const {
    open,
    selectedRelease,
    viewedReleaseIds,
    slideIndex,
    mode,
    featureCount,
    activeFeature,
    previewing,
    direction,
    goToSlide,
    dismiss,
    complete,
    tryFeature,
    selectHistoryRelease,
    openChangelog,
    setMode,
  } = useWhatsNewController(autoOpen);

  useEffect(() => {
    if (!open || !selectedRelease || !activeFeature) return;
    emitWhatsNewAnalytics('whats_new_slide_viewed', {
      releaseId: selectedRelease.id,
      featureId: activeFeature.id,
      slideIndex,
    });

    const frame = slideFrameRef.current;
    if (!frame || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      return;
    const distance = direction > 0 ? 14 : -14;
    frame.animate?.(
      [
        { opacity: 0.35, transform: `translateX(${distance}px)` },
        { opacity: 1, transform: 'translateX(0)' },
      ],
      { duration: 190, easing: 'cubic-bezier(0.2, 0.75, 0.25, 1)' },
    );
  }, [activeFeature, direction, open, selectedRelease, slideIndex]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

    const frame = requestAnimationFrame(() => panelRef.current?.focus());
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((node) => node.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', trapFocus);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', trapFocus);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      requestAnimationFrame(() => previousFocus?.focus());
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismiss('escape');
        return;
      }

      if (mode !== 'release' || featureCount === 0) return;
      const target = event.target as HTMLElement | null;
      const editable = target?.matches(
        'input, textarea, select, [contenteditable="true"]',
      );
      if (editable) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToSlide(slideIndex - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToSlide(slideIndex + 1);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dismiss, featureCount, goToSlide, mode, open, slideIndex]);

  const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') return;
    pointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      target: event.target,
    };
  };

  const pointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' || mode !== 'release') return;
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start) return;
    const target = start.target as HTMLElement | null;
    if (target?.closest('button, a, video, input, textarea, select')) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 46 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
    if (dx < 0) goToSlide(slideIndex + 1);
    else goToSlide(slideIndex - 1);
  };

  if (!open || !selectedRelease) return null;

  return (
    <div
      className="fixed inset-0 z-[170] flex items-stretch justify-center bg-slate-950/55 p-0 backdrop-blur-[3px] sm:items-center sm:p-4 lg:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismiss('backdrop');
      }}
    >
      <section
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        aria-describedby={dialogDescriptionId}
        onMouseDown={(event) => event.stopPropagation()}
        className="flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-[color:var(--dp-warm-surface)] text-[color:var(--dp-ink)] shadow-2xl outline-none sm:h-[min(90dvh,52rem)] sm:max-w-[min(96vw,78rem)] sm:rounded-[1.65rem] sm:border sm:border-white/60 dark:bg-slate-950 dark:sm:border-white/10"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-[color:var(--dp-theme-border)] bg-[color:var(--dp-warm-surface)] px-4 py-3 dark:bg-slate-950 sm:px-6 sm:py-4">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-2.5">
              <h1
                id={dialogTitleId}
                className="shrink-0 text-sm font-semibold tracking-tight text-[color:var(--dp-heading)] sm:text-[15px]"
              >
                DP Resources
              </h1>
              <span className="text-slate-300 dark:text-slate-700" aria-hidden>
                /
              </span>
              <span className="truncate text-sm font-medium text-[color:var(--dp-muted-text)]">
                What’s New
              </span>
            </div>
            <p
              id={dialogDescriptionId}
              className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400"
            >
              {selectedRelease.dateLabel} · {selectedRelease.label}
              {previewing ? ' · Preview' : ''}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {mode === 'release' ? (
              <button
                type="button"
                onClick={() => setMode('history')}
                className="hidden h-9 items-center gap-2 rounded-full px-3 text-xs font-medium text-[color:var(--dp-muted-text)] transition hover:bg-slate-100 hover:text-[color:var(--dp-heading)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--dp-navy)] dark:hover:bg-slate-900 sm:inline-flex"
              >
                <Clock3 className="size-3.5" aria-hidden />
                Release history
              </button>
            ) : null}
            <button
              type="button"
              onClick={openChangelog}
              className="hidden size-9 items-center justify-center rounded-full text-[color:var(--dp-muted-text)] transition hover:bg-slate-100 hover:text-[color:var(--dp-heading)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--dp-navy)] dark:hover:bg-slate-900 sm:flex"
              aria-label="View full changelog"
              title="Full changelog"
            >
              <ListTree className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => dismiss('close_button')}
              className="flex size-9 items-center justify-center rounded-full border border-[color:var(--dp-theme-border)] bg-white/75 text-[color:var(--dp-muted-text)] shadow-sm transition hover:bg-white hover:text-[color:var(--dp-heading)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--dp-navy)] dark:bg-slate-900/80 dark:hover:bg-slate-900"
              aria-label="Close What’s New"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </header>

        {mode === 'history' ? (
          <WhatsNewHistory
            releases={WHATS_NEW_RELEASES}
            selectedReleaseId={selectedRelease.id}
            viewedReleaseIds={viewedReleaseIds}
            onBack={() => setMode('release')}
            onSelect={selectHistoryRelease}
          />
        ) : activeFeature ? (
          <>
            <div
              ref={slideFrameRef}
              className="flex min-h-0 flex-1 touch-pan-y select-none flex-col overflow-y-auto overscroll-contain lg:overflow-hidden"
              onPointerDown={pointerDown}
              onPointerUp={pointerUp}
              onPointerCancel={() => {
                pointerStartRef.current = null;
              }}
            >
              <WhatsNewSlide
                feature={activeFeature}
                active={open}
                index={slideIndex}
                count={featureCount}
                onTryIt={tryFeature}
              />
            </div>

            <footer className="shrink-0 border-t border-[color:var(--dp-theme-border)] bg-[color:var(--dp-warm-surface)] px-4 py-3 dark:bg-slate-950 sm:px-6 sm:py-4">
              <div className="mx-auto max-w-2xl">
                <WhatsNewNavigation
                  activeIndex={slideIndex}
                  count={featureCount}
                  onPrevious={() => goToSlide(slideIndex - 1)}
                  onNext={() => goToSlide(slideIndex + 1)}
                  onSelect={goToSlide}
                  onDone={complete}
                />
              </div>
              <div className="mt-2 flex items-center justify-center gap-3 sm:hidden">
                <button
                  type="button"
                  onClick={() => setMode('history')}
                  className="text-xs font-medium text-[color:var(--dp-muted-text)]"
                >
                  Release history
                </button>
                <span className="text-slate-300 dark:text-slate-700" aria-hidden>
                  ·
                </span>
                <button
                  type="button"
                  onClick={openChangelog}
                  className="text-xs font-medium text-[color:var(--dp-muted-text)]"
                >
                  Full changelog
                </button>
              </div>
            </footer>
          </>
        ) : null}
      </section>
    </div>
  );
}
