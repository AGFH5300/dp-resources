'use client';

import { Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const OPEN_LAYOUT_SELECTOR = '.dp-qb-practice-layout.is-open';
const TOOLBAR_ACTIONS_SELECTOR = '.dp-qb-practice-toolbar > div:last-child';
const FULLSCREEN_ROOT_CLASS = 'dp-qb-practice-fullscreen';

export function QuestionPracticeFullscreenControl() {
  const [layout, setLayout] = useState<HTMLElement | null>(null);
  const [toolbarActions, setToolbarActions] = useState<HTMLElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => {
      const nextLayout = document.querySelector<HTMLElement>(OPEN_LAYOUT_SELECTOR);
      const nextToolbar = nextLayout?.querySelector<HTMLElement>(
        TOOLBAR_ACTIONS_SELECTOR,
      );
      if (!nextLayout) document.documentElement.classList.remove(FULLSCREEN_ROOT_CLASS);
      setLayout(nextLayout);
      setToolbarActions(nextToolbar || null);
      setFullscreen(
        Boolean(nextLayout) &&
          document.documentElement.classList.contains(FULLSCREEN_ROOT_CLASS),
      );
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const exitOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      document.documentElement.classList.remove(FULLSCREEN_ROOT_CLASS);
      setFullscreen(false);
    };
    window.addEventListener('keydown', exitOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', exitOnEscape);
    };
  }, [fullscreen]);

  useEffect(
    () => () => {
      document.documentElement.classList.remove(FULLSCREEN_ROOT_CLASS);
    },
    [],
  );

  if (!layout || !toolbarActions) return null;

  const toggleFullscreen = () => {
    const next = !document.documentElement.classList.contains(
      FULLSCREEN_ROOT_CLASS,
    );
    document.documentElement.classList.toggle(FULLSCREEN_ROOT_CLASS, next);
    setFullscreen(next);
  };

  return createPortal(
    <button
      type="button"
      className="dp-qb-fullscreen-toggle"
      onClick={toggleFullscreen}
      aria-label={fullscreen ? 'Exit fullscreen question view' : 'Open fullscreen question view'}
      aria-pressed={fullscreen}
      title={fullscreen ? 'Exit fullscreen' : 'Open fullscreen'}
    >
      {fullscreen ? (
        <Minimize2 className="size-4" aria-hidden />
      ) : (
        <Maximize2 className="size-4" aria-hidden />
      )}
    </button>,
    toolbarActions,
  );
}
