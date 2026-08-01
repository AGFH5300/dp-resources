'use client';

import { Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import './question-practice-fullscreen-control.module.css';

const OPEN_LAYOUT_SELECTOR = '.dp-qb-practice-layout.is-open';
const PRACTICE_PANE_SELECTOR = '.dp-qb-practice-pane';
const TOOLBAR_ACTIONS_SELECTOR = '.dp-qb-practice-toolbar > div:last-child';
const FULLSCREEN_ROOT_CLASS = 'dp-qb-practice-fullscreen';

export function QuestionPracticeFullscreenControl() {
  const [pane, setPane] = useState<HTMLElement | null>(null);
  const [toolbarActions, setToolbarActions] = useState<HTMLElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const paneRef = useRef<HTMLElement | null>(null);
  const toolbarRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const layout = document.querySelector<HTMLElement>(OPEN_LAYOUT_SELECTOR);
        const nextPane =
          layout?.querySelector<HTMLElement>(PRACTICE_PANE_SELECTOR) || null;
        const nextToolbar =
          nextPane?.querySelector<HTMLElement>(TOOLBAR_ACTIONS_SELECTOR) || null;

        if (!nextPane) {
          document.documentElement.classList.remove(FULLSCREEN_ROOT_CLASS);
        }
        if (paneRef.current !== nextPane) {
          paneRef.current = nextPane;
          setPane(nextPane);
        }
        if (toolbarRef.current !== nextToolbar) {
          toolbarRef.current = nextToolbar;
          setToolbarActions(nextToolbar);
        }
        const nextFullscreen =
          document.fullscreenElement === nextPane ||
          (Boolean(nextPane) &&
            document.documentElement.classList.contains(FULLSCREEN_ROOT_CLASS));
        setFullscreen((current) =>
          current === nextFullscreen ? current : nextFullscreen,
        );
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('fullscreenchange', sync);
    window.addEventListener('dp-question-change', sync);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('fullscreenchange', sync);
      window.removeEventListener('dp-question-change', sync);
    };
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const exitOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.fullscreenElement) return;
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
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    },
    [],
  );

  if (!pane || !toolbarActions) return null;

  const toggleFullscreen = async () => {
    if (document.fullscreenElement === pane) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }

    if (typeof pane.requestFullscreen === 'function') {
      try {
        await pane.requestFullscreen();
        return;
      } catch {
        // Fall through to the in-page fullscreen implementation.
      }
    }

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
      onClick={() => void toggleFullscreen()}
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
