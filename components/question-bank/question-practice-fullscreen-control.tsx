'use client';

import { Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const OPEN_LAYOUT_SELECTOR = '.dp-qb-practice-layout.is-open';
const TOOLBAR_ACTIONS_SELECTOR = '.dp-qb-practice-toolbar > div:last-child';
const FULLSCREEN_ROOT_CLASS = 'dp-qb-practice-fullscreen';

export function QuestionPracticeFullscreenControl() {
  const [layout, setLayout] = useState<HTMLElement | null>(null);
  const [toolbarActions, setToolbarActions] = useState<HTMLElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const layoutRef = useRef<HTMLElement | null>(null);
  const toolbarRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const nextLayout = document.querySelector<HTMLElement>(OPEN_LAYOUT_SELECTOR);
        const nextToolbar = nextLayout?.querySelector<HTMLElement>(
          TOOLBAR_ACTIONS_SELECTOR,
        ) || null;

        if (!nextLayout) {
          document.documentElement.classList.remove(FULLSCREEN_ROOT_CLASS);
        }
        if (layoutRef.current !== nextLayout) {
          layoutRef.current = nextLayout;
          setLayout(nextLayout);
        }
        if (toolbarRef.current !== nextToolbar) {
          toolbarRef.current = nextToolbar;
          setToolbarActions(nextToolbar);
        }
        const nextFullscreen =
          Boolean(nextLayout) &&
          document.documentElement.classList.contains(FULLSCREEN_ROOT_CLASS);
        setFullscreen((current) =>
          current === nextFullscreen ? current : nextFullscreen,
        );
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
    window.addEventListener('dp-question-change', sync);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('dp-question-change', sync);
    };
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
