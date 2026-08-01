'use client';

import { Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import fullscreenStyles from './question-practice-fullscreen-control.module.css';

const OPEN_LAYOUT_SELECTOR = '.dp-qb-practice-layout.is-open';
const TOOLBAR_ACTIONS_SELECTOR = '.dp-qb-practice-toolbar > div:last-child';
const QUESTION_FOCUS_CLASS = 'is-question-focus';

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
        const layout = document.querySelector<HTMLElement>(OPEN_LAYOUT_SELECTOR);
        const nextToolbar =
          layout?.querySelector<HTMLElement>(TOOLBAR_ACTIONS_SELECTOR) || null;

        if (layoutRef.current !== layout) {
          layoutRef.current?.classList.remove(QUESTION_FOCUS_CLASS);
          layoutRef.current = layout;
          setLayout(layout);
        }
        if (toolbarRef.current !== nextToolbar) {
          toolbarRef.current = nextToolbar;
          setToolbarActions(nextToolbar);
        }
        const nextFullscreen = Boolean(layout?.classList.contains(QUESTION_FOCUS_CLASS));
        setFullscreen((current) =>
          current === nextFullscreen ? current : nextFullscreen,
        );
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('dp-question-change', sync);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('dp-question-change', sync);
    };
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const exitOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      layout?.classList.remove(QUESTION_FOCUS_CLASS);
      setFullscreen(false);
    };
    window.addEventListener('keydown', exitOnEscape);

    return () => {
      window.removeEventListener('keydown', exitOnEscape);
    };
  }, [fullscreen, layout]);

  useEffect(
    () => () => {
      layoutRef.current?.classList.remove(QUESTION_FOCUS_CLASS);
    },
    [],
  );

  if (!layout || !toolbarActions) return null;

  const toggleFullscreen = () => {
    const next = !layout.classList.contains(QUESTION_FOCUS_CLASS);
    layout.classList.toggle(QUESTION_FOCUS_CLASS, next);
    setFullscreen(next);
  };

  return createPortal(
    <button
      type="button"
      className={`${fullscreenStyles.control} dp-qb-fullscreen-toggle`}
      onClick={toggleFullscreen}
      aria-label={fullscreen ? 'Restore question list' : 'Show question full width'}
      aria-pressed={fullscreen}
      title={fullscreen ? 'Restore question list' : 'Show question full width'}
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
