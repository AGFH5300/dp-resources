'use client';

import { Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const OPEN_LAYOUT_SELECTOR = '.dp-qb-practice-layout.is-open';
const TOOLBAR_ACTIONS_SELECTOR = '.dp-qb-practice-toolbar > div:last-child';

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
      setLayout(nextLayout);
      setToolbarActions(nextToolbar || null);
      setFullscreen(Boolean(nextLayout?.classList.contains('is-fullscreen')));
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
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
      layout?.classList.remove('is-fullscreen');
      setFullscreen(false);
    };
    window.addEventListener('keydown', exitOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', exitOnEscape);
    };
  }, [fullscreen, layout]);

  useEffect(
    () => () => {
      layout?.classList.remove('is-fullscreen');
    },
    [layout],
  );

  if (!layout || !toolbarActions) return null;

  const toggleFullscreen = () => {
    const next = !layout.classList.contains('is-fullscreen');
    layout.classList.toggle('is-fullscreen', next);
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
