'use client';

import { ChevronLeft, ChevronRight, MousePointerClick } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import {
  CORE_TUTORIAL_KEY,
  CORE_TUTORIAL_SESSION_STORAGE_KEY,
  CORE_TUTORIAL_VERSION,
  TUTORIAL_ACTIVE_STORAGE_KEY,
  TUTORIAL_CHECK_COMPLETE_EVENT,
  TUTORIAL_CHECKING_STORAGE_KEY,
  TUTORIAL_OPENED_EVENT,
  TUTORIAL_START_EVENT,
} from '@/lib/tutorials';

type SelectorTarget = {
  selectors: string[];
};

type TextTarget = {
  selector: string;
  text: string;
  closest?: string;
};

type TutorialTarget = SelectorTarget | TextTarget;

type TutorialStep = {
  id: string;
  title: string;
  description: string;
  route?: string;
  target?: TutorialTarget;
  interactive?: boolean;
  advanceOnInteraction?: boolean;
  interactionEvent?: 'change' | 'click';
  interactionAdvanceDelayMs?: number;
  requireInteraction?: boolean;
  interactionHint?: string;
  placement?: 'auto' | 'left';
  centerTarget?: boolean;
};

type HighlightRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

type StoredTutorialSession = {
  key: string;
  version: number;
  stepIndex: number;
  replay?: boolean;
};

type StartTutorialDetail = {
  key?: string;
  version?: number;
  stepIndex?: number;
  replay?: boolean;
};

const SOURCE_TARGET: TextTarget = {
  selector: 'legend',
  text: 'Sources',
  closest: 'fieldset',
};

const LIBRARY_ROUTE = '/library';
const PREFETCH_ROUTES = [
  '/library',
  '/question-bank',
  '/question-bank/build',
  '/settings',
] as const;

const STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to DP Resources',
    description:
      'This short walkthrough uses the real interface so you know exactly where everything lives. You can skip it at any time and replay it later from Settings.',
    route: LIBRARY_ROUTE,
  },
  {
    id: 'library',
    title: 'Your Library',
    description:
      'The Library is the main home for textbooks, notes, past papers, and other learning resources. Open folders and resources here whenever you want to browse directly.',
    route: LIBRARY_ROUTE,
    target: {
      selectors: ['[data-tutorial-target="nav-library"]'],
    },
  },
  {
    id: 'ib-resource-library',
    title: 'IB Resource Library',
    description:
      'The IB Resource Library is the most comprehensive list of IB resources on DP Resources. Use this master catalogue to find compiled DP revision resources by subject, topic, and direct resource link.',
    route: LIBRARY_ROUTE,
    target: {
      selectors: ['[data-tutorial-target="ib-resource-library"]'],
    },
  },
  {
    id: 'question-bank',
    title: 'Question Bank',
    description:
      'Use the Question Bank to find practice questions by subject and topic, then move from browsing into focused practice when you are ready.',
    route: '/question-bank',
    target: {
      selectors: ['[data-tutorial-target="nav-question-bank"]'],
    },
  },
  {
    id: 'search',
    title: 'Search from anywhere',
    description:
      'Global search is always close by. On desktop you can also press ⌘ K on Mac or Ctrl K on Windows to open it without leaving what you are doing.',
    route: '/question-bank',
    target: {
      selectors: ['button[aria-label^="Search library"]'],
    },
  },
  {
    id: 'practice-builder',
    title: 'Build targeted practice',
    description:
      'Practice Builder lets you create a focused question set instead of working through everything. Choose exactly what you want to practise and generate a session.',
    route: '/question-bank',
    target: {
      selectors: ['main a[href="/question-bank/build"]'],
    },
  },
  {
    id: 'source-filters-try',
    title: 'Source filters: try one',
    description:
      'These are the real source controls inside Practice Builder. You can try a source checkbox to see the filter work, or simply continue to the next step.',
    route: '/question-bank/build',
    target: SOURCE_TARGET,
    interactive: true,
    advanceOnInteraction: true,
    interactionEvent: 'change',
    placement: 'left',
    centerTarget: true,
    interactionHint:
      'Try it now: click any source checkbox if you want, or press Next to continue.',
  },
  {
    id: 'source-filters-explain',
    title: 'Use one source, several, or all',
    description:
      'Checked sources restrict the practice set to those providers. Leave every source unchecked to use all available sources. You can click the highlighted controls again now if you want to change or undo your test selection.',
    route: '/question-bank/build',
    target: SOURCE_TARGET,
    interactive: true,
    placement: 'left',
    centerTarget: true,
    interactionHint:
      'The highlighted controls stay live while this step is open. Change them if you want, or just press Next.',
  },
  {
    id: 'recent',
    title: 'Pick up where you left off',
    description:
      'Recent keeps the resources you opened lately within reach, so you can return to something without finding it again from scratch.',
    route: LIBRARY_ROUTE,
    target: {
      selectors: ['[data-tutorial-target="nav-recent"]'],
    },
  },
  {
    id: 'saved',
    title: 'Keep important resources Saved',
    description:
      'Saved is your personal shortcut to resources you want to come back to. Use it for frequently used material or anything you do not want to lose track of.',
    route: LIBRARY_ROUTE,
    target: {
      selectors: ['[data-tutorial-target="nav-saved"]'],
    },
  },
  {
    id: 'account-menu',
    title: 'Open your account menu',
    description:
      'Your profile menu contains Settings & Account Centre. Click the highlighted account button to open it.',
    route: LIBRARY_ROUTE,
    target: {
      selectors: ['[data-tutorial-target="account-menu"]'],
    },
    interactive: true,
    advanceOnInteraction: true,
    interactionEvent: 'click',
    interactionAdvanceDelayMs: 90,
    requireInteraction: true,
    interactionHint:
      'Click the highlighted account button. The next step will point to Settings inside the menu.',
  },
  {
    id: 'settings-link',
    title: 'Open Settings',
    description:
      'Now click Settings in the account menu. This takes you to Settings & Account Centre, where your profile, preferences, connected accounts, and security controls live.',
    route: LIBRARY_ROUTE,
    target: {
      selectors: ['[data-tutorial-target="settings-link"]'],
    },
    interactive: true,
    advanceOnInteraction: true,
    interactionEvent: 'click',
    interactionAdvanceDelayMs: 0,
    requireInteraction: true,
    interactionHint: 'Click the highlighted Settings item to continue.',
  },
  {
    id: 'tutorial-replay',
    title: 'Replay the tutorial anytime',
    description:
      'That is the full tour. If you ever want to run it again, come back to Settings and use this Replay tutorial button.',
    route: '/settings',
    target: {
      selectors: ['[data-tutorial-target="tutorial-replay-button"]'],
    },
  },
];

function visibleElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function resolveTarget(target: TutorialTarget | undefined) {
  if (!target) return null;

  if ('selectors' in target) {
    for (const selector of target.selectors) {
      const match = Array.from(document.querySelectorAll(selector)).find(
        visibleElement,
      );
      if (match) return match as HTMLElement;
    }
    return null;
  }

  for (const candidate of Array.from(
    document.querySelectorAll(target.selector),
  )) {
    if (candidate.textContent?.trim() !== target.text) continue;
    const match = target.closest ? candidate.closest(target.closest) : candidate;
    if (visibleElement(match)) return match;
  }
  return null;
}

function measureTarget(element: HTMLElement): HighlightRect {
  const rect = element.getBoundingClientRect();
  const padding = 8;
  const left = Math.max(6, rect.left - padding);
  const top = Math.max(6, rect.top - padding);
  const right = Math.min(window.innerWidth - 6, rect.right + padding);
  const bottom = Math.min(window.innerHeight - 6, rect.bottom + padding);

  return {
    top,
    right,
    bottom,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function readStoredSession(): StoredTutorialSession | null {
  try {
    const raw = window.sessionStorage.getItem(
      CORE_TUTORIAL_SESSION_STORAGE_KEY,
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredTutorialSession;
    if (
      parsed.key !== CORE_TUTORIAL_KEY ||
      parsed.version !== CORE_TUTORIAL_VERSION ||
      !Number.isInteger(parsed.stepIndex) ||
      parsed.stepIndex < 0 ||
      parsed.stepIndex >= STEPS.length
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function storeSession(stepIndex: number, replay: boolean) {
  try {
    window.sessionStorage.setItem(
      CORE_TUTORIAL_SESSION_STORAGE_KEY,
      JSON.stringify({
        key: CORE_TUTORIAL_KEY,
        version: CORE_TUTORIAL_VERSION,
        stepIndex,
        replay,
      } satisfies StoredTutorialSession),
    );
    window.sessionStorage.setItem(TUTORIAL_ACTIVE_STORAGE_KEY, '1');
    window.sessionStorage.removeItem(TUTORIAL_CHECKING_STORAGE_KEY);
  } catch {
    // The walkthrough still works when sessionStorage is unavailable.
  }
}

function clearStoredSession() {
  try {
    window.sessionStorage.removeItem(CORE_TUTORIAL_SESSION_STORAGE_KEY);
    window.sessionStorage.removeItem(TUTORIAL_ACTIVE_STORAGE_KEY);
    window.sessionStorage.removeItem(TUTORIAL_CHECKING_STORAGE_KEY);
  } catch {
    // Nothing else is required when browser storage is unavailable.
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function TutorialController({ userId }: { userId?: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const cardRef = useRef<HTMLElement>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const interactionTimerRef = useRef<number | null>(null);
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [replay, setReplay] = useState(false);
  const [highlight, setHighlight] = useState<HighlightRect | null>(null);
  const [readyStepId, setReadyStepId] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const step = STEPS[stepIndex] ?? STEPS[0];
  const targetReady = !step.target || readyStepId === step.id;
  const targetPending = active && !targetReady;
  const visibleHighlight = targetReady ? highlight : null;
  const requiresInteraction = Boolean(
    step.requireInteraction && step.advanceOnInteraction,
  );

  useLayoutEffect(() => {
    if (!userId) return;
    try {
      window.sessionStorage.setItem(TUTORIAL_CHECKING_STORAGE_KEY, '1');
    } catch {
      // Coordination with What's New is best-effort only.
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    for (const route of PREFETCH_ROUTES) router.prefetch(route);
  }, [router, userId]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  const startTutorial = useCallback(
    (requestedIndex = 0, isReplay = false) => {
      if (!userId) return;
      const nextIndex = clamp(requestedIndex, 0, STEPS.length - 1);
      setSaveError(null);
      setReplay(isReplay);
      setStepIndex(nextIndex);
      setReadyStepId(null);
      setHighlight(null);
      setActive(true);
      storeSession(nextIndex, isReplay);
      window.dispatchEvent(new Event(TUTORIAL_OPENED_EVENT));
    },
    [userId],
  );

  useEffect(() => {
    if (!userId) return;

    const stored = readStoredSession();
    if (stored) {
      startTutorial(stored.stepIndex, Boolean(stored.replay));
      return;
    }

    let cancelled = false;
    const params = new URLSearchParams({
      key: CORE_TUTORIAL_KEY,
      version: String(CORE_TUTORIAL_VERSION),
    });

    void fetch(`/api/tutorials/progress?${params.toString()}`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load tutorial progress.');
        return (await response.json()) as { dismissed?: boolean };
      })
      .then((payload) => {
        if (cancelled) return;
        if (!payload.dismissed) {
          startTutorial(0, false);
          return;
        }
        try {
          window.sessionStorage.removeItem(TUTORIAL_CHECKING_STORAGE_KEY);
        } catch {
          // Best-effort coordination only.
        }
        window.dispatchEvent(new Event(TUTORIAL_CHECK_COMPLETE_EVENT));
      })
      .catch(() => {
        if (cancelled) return;
        try {
          window.sessionStorage.removeItem(TUTORIAL_CHECKING_STORAGE_KEY);
        } catch {
          // Best-effort coordination only.
        }
        window.dispatchEvent(new Event(TUTORIAL_CHECK_COMPLETE_EVENT));
      });

    return () => {
      cancelled = true;
    };
  }, [startTutorial, userId]);

  useEffect(() => {
    const handleStart = (event: Event) => {
      const detail = (event as CustomEvent<StartTutorialDetail>).detail;
      if (
        detail?.key !== CORE_TUTORIAL_KEY ||
        detail.version !== CORE_TUTORIAL_VERSION
      ) {
        return;
      }
      startTutorial(
        Number.isInteger(detail.stepIndex) ? detail.stepIndex : 0,
        detail.replay !== false,
      );
    };

    window.addEventListener(TUTORIAL_START_EVENT, handleStart);
    return () => window.removeEventListener(TUTORIAL_START_EVENT, handleStart);
  }, [startTutorial]);

  useEffect(() => {
    if (!active || !step.route || pathname === step.route) return;
    router.replace(step.route);
  }, [active, pathname, router, step.route]);

  useEffect(() => {
    if (!active) return;

    const html = document.documentElement;
    const body = document.body;
    const previous = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
    };

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overscrollBehavior = 'none';

    const allowTutorialNode = (node: Node | null) => {
      if (!node) return false;
      if (cardRef.current?.contains(node)) return true;
      return Boolean(step.interactive && targetRef.current?.contains(node));
    };

    const blockPageScroll = (event: Event) => {
      if (cardRef.current?.contains(event.target as Node)) return;
      event.preventDefault();
    };

    const blockOutsideInteraction = (event: Event) => {
      if (allowTutorialNode(event.target as Node)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener('wheel', blockPageScroll, {
      capture: true,
      passive: false,
    });
    document.addEventListener('touchmove', blockPageScroll, {
      capture: true,
      passive: false,
    });
    document.addEventListener('click', blockOutsideInteraction, true);
    document.addEventListener('mousedown', blockOutsideInteraction, true);

    return () => {
      html.style.overflow = previous.htmlOverflow;
      body.style.overflow = previous.bodyOverflow;
      html.style.overscrollBehavior = previous.htmlOverscroll;
      body.style.overscrollBehavior = previous.bodyOverscroll;
      document.removeEventListener('wheel', blockPageScroll, true);
      document.removeEventListener('touchmove', blockPageScroll, true);
      document.removeEventListener('click', blockOutsideInteraction, true);
      document.removeEventListener('mousedown', blockOutsideInteraction, true);
    };
  }, [active, step.id, step.interactive]);

  useEffect(() => {
    if (!active) {
      targetRef.current = null;
      setHighlight(null);
      setReadyStepId(null);
      return;
    }

    storeSession(stepIndex, replay);
    targetRef.current = null;
    setHighlight(null);
    setReadyStepId(null);

    if (interactionTimerRef.current !== null) {
      window.clearTimeout(interactionTimerRef.current);
      interactionTimerRef.current = null;
    }

    if (!step.target) {
      setReadyStepId(step.id);
      return;
    }

    let cancelled = false;
    let frame = 0;
    let attempts = 0;
    let observer: ResizeObserver | null = null;
    let interactionTarget: HTMLElement | null = null;
    let interactionEvent: 'change' | 'click' | null = null;
    let interactionCapture = false;

    const update = () => {
      if (cancelled || !targetRef.current) return;
      setHighlight(measureTarget(targetRef.current));
    };

    const commitNextStep = () => {
      if (cancelled) return;
      const nextIndex = Math.min(stepIndex + 1, STEPS.length - 1);
      setStepIndex(nextIndex);
      setReadyStepId(null);
      setHighlight(null);
      storeSession(nextIndex, replay);
      interactionTimerRef.current = null;
    };

    const advanceAfterInteraction = (event: Event) => {
      if (!step.advanceOnInteraction) return;
      const eventName = step.interactionEvent ?? 'change';
      if (eventName === 'change') {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || input.type !== 'checkbox') {
          return;
        }
      }

      if (interactionTimerRef.current !== null) {
        window.clearTimeout(interactionTimerRef.current);
      }

      const delay = reducedMotion
        ? 0
        : (step.interactionAdvanceDelayMs ?? (eventName === 'change' ? 220 : 90));
      if (delay <= 0) {
        commitNextStep();
        return;
      }

      interactionTimerRef.current = window.setTimeout(commitNextStep, delay);
    };

    const locate = () => {
      if (cancelled) return;
      const target = resolveTarget(step.target);
      if (!target) {
        attempts += 1;
        if (attempts < 300) frame = window.requestAnimationFrame(locate);
        return;
      }

      targetRef.current = target;
      const rect = target.getBoundingClientRect();
      if (
        step.centerTarget ||
        rect.top < 76 ||
        rect.bottom > window.innerHeight - 24
      ) {
        target.scrollIntoView({
          block: 'center',
          inline: 'nearest',
          behavior: 'auto',
        });
      }
      update();
      setReadyStepId(step.id);

      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(update);
        observer.observe(target);
      }

      if (step.interactive && step.advanceOnInteraction) {
        interactionTarget = target;
        interactionEvent = step.interactionEvent ?? 'change';
        interactionCapture = interactionEvent === 'click';
        target.addEventListener(
          interactionEvent,
          advanceAfterInteraction,
          interactionCapture,
        );
      }
    };

    frame = window.requestAnimationFrame(locate);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      observer?.disconnect();
      if (interactionTarget && interactionEvent) {
        interactionTarget.removeEventListener(
          interactionEvent,
          advanceAfterInteraction,
          interactionCapture,
        );
      }
      targetRef.current = null;
    };
  }, [active, reducedMotion, replay, step, stepIndex]);

  useEffect(() => {
    if (!active || targetPending) return;
    const frame = window.requestAnimationFrame(() => cardRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [active, stepIndex, targetPending]);

  useEffect(
    () => () => {
      if (interactionTimerRef.current !== null) {
        window.clearTimeout(interactionTimerRef.current);
      }
    },
    [],
  );

  const persistDismissal = useCallback(async () => {
    const response = await fetch('/api/tutorials/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: CORE_TUTORIAL_KEY,
        version: CORE_TUTORIAL_VERSION,
      }),
      keepalive: true,
    });
    if (!response.ok) throw new Error('Unable to save tutorial progress.');
  }, []);

  const closeTutorial = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await persistDismissal();
      clearStoredSession();
      setHighlight(null);
      setReadyStepId(null);
      setActive(false);
    } catch {
      setSaveError('Your progress could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [persistDismissal, saving]);

  const moveToStep = useCallback(
    (nextIndex: number) => {
      const clamped = clamp(nextIndex, 0, STEPS.length - 1);
      setSaveError(null);
      targetRef.current = null;
      setReadyStepId(null);
      setHighlight(null);
      setStepIndex(clamped);
      storeSession(clamped, replay);
    },
    [replay],
  );

  const goBack = useCallback(() => {
    if (saving || targetPending || stepIndex <= 0) return;
    moveToStep(stepIndex - 1);
  }, [moveToStep, saving, stepIndex, targetPending]);

  const goNext = useCallback(() => {
    if (saving || targetPending || requiresInteraction) return;
    if (stepIndex >= STEPS.length - 1) {
      void closeTutorial();
      return;
    }
    moveToStep(stepIndex + 1);
  }, [
    closeTutorial,
    moveToStep,
    requiresInteraction,
    saving,
    stepIndex,
    targetPending,
  ]);

  useEffect(() => {
    if (!active) return;

    const focusableSelector =
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        void closeTutorial();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goBack();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goNext();
        return;
      }

      const eventNode = event.target as Node | null;
      const insideCard = Boolean(eventNode && cardRef.current?.contains(eventNode));
      const insideInteractiveTarget = Boolean(
        eventNode && step.interactive && targetRef.current?.contains(eventNode),
      );
      if (
        ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(
          event.key,
        ) &&
        !insideCard &&
        !insideInteractiveTarget
      ) {
        event.preventDefault();
        return;
      }

      if (event.key !== 'Tab' || !cardRef.current || targetPending) return;

      const focusable: HTMLElement[] = [];
      const addFocusable = (root: HTMLElement) => {
        if (root.matches(focusableSelector)) focusable.push(root);
        focusable.push(
          ...Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)),
        );
      };
      addFocusable(cardRef.current);
      if (step.interactive && targetRef.current) addFocusable(targetRef.current);

      const uniqueFocusable = Array.from(new Set(focusable)).filter(visibleElement);
      if (uniqueFocusable.length === 0) {
        event.preventDefault();
        cardRef.current.focus();
        return;
      }

      const current = document.activeElement as HTMLElement | null;
      const index = current ? uniqueFocusable.indexOf(current) : -1;
      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        uniqueFocusable[uniqueFocusable.length - 1]?.focus();
      } else if (!event.shiftKey && index === uniqueFocusable.length - 1) {
        event.preventDefault();
        uniqueFocusable[0]?.focus();
      } else if (index === -1) {
        event.preventDefault();
        (event.shiftKey
          ? uniqueFocusable[uniqueFocusable.length - 1]
          : uniqueFocusable[0]
        )?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [active, closeTutorial, goBack, goNext, step.interactive, targetPending]);

  const cardStyle = useMemo<CSSProperties>(() => {
    if (typeof window === 'undefined') return {};

    if (!visibleHighlight) {
      return {
        left: '50%',
        top: '50%',
        width: 'min(24rem, calc(100vw - 2rem))',
        transform: 'translate(-50%, -50%)',
      };
    }

    if (window.innerWidth < 640) {
      const targetNearBottom =
        visibleHighlight.bottom > window.innerHeight * 0.62;
      return targetNearBottom
        ? {
            left: 12,
            right: 12,
            top: 'calc(12px + env(safe-area-inset-top))',
          }
        : {
            left: 12,
            right: 12,
            bottom: 'calc(12px + env(safe-area-inset-bottom))',
          };
    }

    const width = Math.min(384, window.innerWidth - 32);
    const gap = 16;

    if (step.placement === 'left') {
      const availableLeft = Math.max(0, visibleHighlight.left - gap - 16);
      const leftWidth = Math.min(width, Math.max(260, availableLeft));
      const cardHeight = Math.min(
        cardRef.current?.offsetHeight || 360,
        window.innerHeight - 32,
      );
      return {
        left: Math.max(16, visibleHighlight.left - leftWidth - gap),
        top: clamp(
          visibleHighlight.top,
          16,
          Math.max(16, window.innerHeight - cardHeight - 16),
        ),
        width: leftWidth,
      };
    }

    const left = clamp(
      visibleHighlight.left,
      16,
      window.innerWidth - width - 16,
    );
    const roomBelow = window.innerHeight - visibleHighlight.bottom;

    if (roomBelow >= 290) {
      return { left, top: visibleHighlight.bottom + gap, width };
    }
    if (visibleHighlight.top >= 290) {
      return {
        left,
        bottom: window.innerHeight - visibleHighlight.top + gap,
        width,
      };
    }

    return { right: 16, top: 88, width };
  }, [step.placement, visibleHighlight]);

  if (!active) return null;

  const progress = ((stepIndex + 1) / STEPS.length) * 100;
  const backdropClass = 'fixed z-[80] bg-slate-950/70';

  return (
    <>
      {visibleHighlight ? (
        <>
          <div
            aria-hidden
            className={backdropClass}
            style={{ left: 0, top: 0, right: 0, height: visibleHighlight.top }}
          />
          <div
            aria-hidden
            className={backdropClass}
            style={{
              left: 0,
              top: visibleHighlight.top,
              width: visibleHighlight.left,
              height: visibleHighlight.height,
            }}
          />
          <div
            aria-hidden
            className={backdropClass}
            style={{
              left: visibleHighlight.right,
              top: visibleHighlight.top,
              right: 0,
              height: visibleHighlight.height,
            }}
          />
          <div
            aria-hidden
            className={backdropClass}
            style={{
              left: 0,
              top: visibleHighlight.bottom,
              right: 0,
              bottom: 0,
            }}
          />
          <div
            aria-hidden
            className={`pointer-events-none fixed z-[90] rounded-xl border-2 border-blue-400 ring-4 ring-white/80 ${
              reducedMotion ? '' : 'transition-all duration-150'
            }`}
            style={{
              left: visibleHighlight.left,
              top: visibleHighlight.top,
              width: visibleHighlight.width,
              height: visibleHighlight.height,
            }}
          />
        </>
      ) : (
        <div aria-hidden className="fixed inset-0 z-[80] bg-slate-950/70" />
      )}

      <section
        ref={cardRef}
        data-tutorial-overlay="true"
        role="dialog"
        aria-modal={step.interactive ? false : true}
        aria-labelledby={`tutorial-title-${step.id}`}
        aria-describedby={`tutorial-description-${step.id}`}
        tabIndex={-1}
        style={cardStyle}
        className={`fixed z-[100] max-h-[min(72vh,34rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:p-6 ${
          reducedMotion ? '' : 'transition-[top,left,right,bottom] duration-150'
        }`}
      >
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700 dark:text-blue-300">
            Step {stepIndex + 1} of {STEPS.length}
          </p>
          <h2
            id={`tutorial-title-${step.id}`}
            className="mt-2 text-xl font-semibold tracking-tight"
          >
            {step.title}
          </h2>
        </div>

        <div
          aria-hidden
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
        >
          <div
            className={`h-full rounded-full bg-blue-600 ${
              reducedMotion ? '' : 'transition-[width] duration-150'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>

        <p
          id={`tutorial-description-${step.id}`}
          className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300"
        >
          {step.description}
        </p>

        {!targetPending && step.interactionHint ? (
          <div className="mt-4 flex gap-3 rounded-xl border border-indigo-100 bg-indigo-50 px-3.5 py-3 text-sm text-indigo-900 dark:border-indigo-900/70 dark:bg-indigo-950/35 dark:text-indigo-100">
            <MousePointerClick className="mt-0.5 size-5 shrink-0" aria-hidden />
            <span>{step.interactionHint}</span>
          </div>
        ) : null}

        {saveError ? (
          <p
            role="alert"
            className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
          >
            {saveError}
          </p>
        ) : null}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => void closeTutorial()}
            disabled={saving}
            className="text-sm font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-100"
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goBack}
              disabled={stepIndex === 0 || saving || targetPending}
              className="inline-flex min-h-10 items-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="size-4" aria-hidden />
              Back
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={saving || targetPending || requiresInteraction}
              className="inline-flex min-h-10 items-center gap-1 rounded-md bg-[color:var(--dp-navy)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {requiresInteraction
                ? 'Use highlighted control'
                : stepIndex === STEPS.length - 1
                  ? 'Finish'
                  : 'Next'}
              {!requiresInteraction && stepIndex < STEPS.length - 1 ? (
                <ChevronRight className="size-4" aria-hidden />
              ) : null}
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-slate-400 dark:text-slate-500">
          Keyboard: ← / → to navigate · Esc to skip
        </p>
      </section>
    </>
  );
}
