'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  emitWhatsNewAnalytics,
  fetchAccountViewedReleaseIds,
  markReleaseViewedLocally,
  persistAccountViewedRelease,
  readLocalViewedReleaseIds,
  writeLocalViewedReleaseIds,
} from '@/lib/whats-new-client';
import {
  getWhatsNewRelease,
  latestAutoOpenRelease,
  WHATS_NEW_OPEN_EVENT,
  WHATS_NEW_RELEASES,
  type WhatsNewRelease,
} from '@/lib/whats-new';
import {
  TUTORIAL_ACTIVE_STORAGE_KEY,
  TUTORIAL_CHECK_COMPLETE_EVENT,
  TUTORIAL_CHECKING_STORAGE_KEY,
  TUTORIAL_OPENED_EVENT,
} from '@/lib/tutorials';

export type WhatsNewViewMode = 'release' | 'history';
type OpenReason = 'auto' | 'manual' | 'preview';

function tutorialBlocksAutoOpen() {
  try {
    return (
      window.sessionStorage.getItem(TUTORIAL_ACTIVE_STORAGE_KEY) === '1' ||
      window.sessionStorage.getItem(TUTORIAL_CHECKING_STORAGE_KEY) === '1'
    );
  } catch {
    return false;
  }
}

async function previewReleaseFromLocation() {
  try {
    const releaseId = new URLSearchParams(window.location.search).get(
      'previewWhatsNew',
    );
    if (!releaseId) return null;

    const response = await fetch(
      `/api/account/whats-new/preview?releaseId=${encodeURIComponent(releaseId)}`,
      { cache: 'no-store' },
    );
    if (!response.ok) return null;

    const payload = (await response.json()) as { releaseId?: unknown };
    return typeof payload.releaseId === 'string'
      ? getWhatsNewRelease(payload.releaseId)
      : null;
  } catch {
    return null;
  }
}

export function useWhatsNewController(autoOpen = true) {
  const router = useRouter();
  const pathname = usePathname();
  const previousPathRef = useRef(pathname);
  const viewedRef = useRef<string[]>([]);
  const previewSessionRef = useRef(false);
  const openRef = useRef(false);
  const directionRef = useRef<1 | -1>(1);

  const initialRelease = latestAutoOpenRelease() ?? WHATS_NEW_RELEASES[0];
  const [open, setOpen] = useState(false);
  const [stateReady, setStateReady] = useState(false);
  const [selectedReleaseId, setSelectedReleaseId] = useState(
    initialRelease?.id ?? '',
  );
  const [viewedReleaseIds, setViewedReleaseIds] = useState<string[]>([]);
  const [slideIndex, setSlideIndex] = useState(0);
  const [mode, setMode] = useState<WhatsNewViewMode>('release');

  const selectedRelease =
    getWhatsNewRelease(selectedReleaseId) ?? initialRelease ?? null;
  const featureCount = selectedRelease?.features.length ?? 0;
  const activeFeature = selectedRelease?.features[slideIndex] ?? null;

  const setViewed = useCallback((releaseIds: readonly string[]) => {
    const normalized = Array.from(new Set(releaseIds));
    viewedRef.current = normalized;
    setViewedReleaseIds(normalized);
    writeLocalViewedReleaseIds(normalized);
  }, []);

  const markViewed = useCallback((release: WhatsNewRelease | null) => {
    if (!release || previewSessionRef.current) return;
    const next = Array.from(new Set([...viewedRef.current, release.id]));
    viewedRef.current = next;
    setViewedReleaseIds(next);
    markReleaseViewedLocally(release.id);
    void persistAccountViewedRelease(release.id);
  }, []);

  const showRelease = useCallback(
    (release: WhatsNewRelease, reason: OpenReason) => {
      previewSessionRef.current = reason === 'preview';
      directionRef.current = 1;
      setSelectedReleaseId(release.id);
      setSlideIndex(0);
      setMode('release');
      setOpen(true);
      emitWhatsNewAnalytics(
        reason === 'manual' ? 'whats_new_reopened' : 'whats_new_opened',
        { releaseId: release.id, reason },
      );
    },
    [],
  );

  const goToSlide = useCallback(
    (nextIndex: number) => {
      if (!selectedRelease || featureCount === 0) return;
      const bounded = Math.max(0, Math.min(featureCount - 1, nextIndex));
      if (bounded === slideIndex) return;
      directionRef.current = bounded > slideIndex ? 1 : -1;
      setSlideIndex(bounded);
    },
    [featureCount, selectedRelease, slideIndex],
  );

  const dismiss = useCallback(
    (reason: string) => {
      markViewed(selectedRelease);
      if (selectedRelease) {
        emitWhatsNewAnalytics('whats_new_dismissed', {
          releaseId: selectedRelease.id,
          slideIndex,
          reason,
        });
      }
      setOpen(false);
    },
    [markViewed, selectedRelease, slideIndex],
  );

  const complete = useCallback(() => {
    markViewed(selectedRelease);
    if (selectedRelease) {
      emitWhatsNewAnalytics('whats_new_completed', {
        releaseId: selectedRelease.id,
      });
    }
    setOpen(false);
  }, [markViewed, selectedRelease]);

  const tryFeature = useCallback(
    (href: string) => {
      markViewed(selectedRelease);
      if (selectedRelease && activeFeature) {
        emitWhatsNewAnalytics('whats_new_try_it_clicked', {
          releaseId: selectedRelease.id,
          featureId: activeFeature.id,
          href,
        });
      }
      setOpen(false);
      router.push(href);
    },
    [activeFeature, markViewed, router, selectedRelease],
  );

  const selectHistoryRelease = useCallback((release: WhatsNewRelease) => {
    directionRef.current = 1;
    setSelectedReleaseId(release.id);
    setSlideIndex(0);
    setMode('release');
    emitWhatsNewAnalytics('whats_new_reopened', {
      releaseId: release.id,
      reason: 'history',
    });
  }, []);

  const openChangelog = useCallback(() => {
    markViewed(selectedRelease);
    setOpen(false);
    router.push('/changelog');
  }, [markViewed, router, selectedRelease]);

  const attemptAutoOpen = useCallback(() => {
    if (!autoOpen || !stateReady || tutorialBlocksAutoOpen() || openRef.current)
      return;
    const release = latestAutoOpenRelease();
    if (!release || viewedRef.current.includes(release.id)) return;
    showRelease(release, 'auto');
  }, [autoOpen, showRelease, stateReady]);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      const local = readLocalViewedReleaseIds();
      const remote = await fetchAccountViewedReleaseIds();
      if (cancelled) return;

      const merged = Array.from(new Set([...local, ...(remote ?? [])]));
      setViewed(merged);
      setStateReady(true);

      if (remote) {
        const remoteSet = new Set(remote);
        for (const releaseId of local) {
          if (remoteSet.has(releaseId) || !getWhatsNewRelease(releaseId)) continue;
          void persistAccountViewedRelease(releaseId);
        }
      }

      const preview = await previewReleaseFromLocation();
      if (cancelled) return;
      if (preview) {
        showRelease(preview, 'preview');
        return;
      }

      const latest = latestAutoOpenRelease();
      if (
        autoOpen &&
        !tutorialBlocksAutoOpen() &&
        latest &&
        !merged.includes(latest.id)
      ) {
        showRelease(latest, 'auto');
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [autoOpen, setViewed, showRelease]);

  useEffect(() => {
    const show = (event: Event) => {
      const detail = (event as CustomEvent<{ releaseId?: string }>).detail;
      const release =
        getWhatsNewRelease(detail?.releaseId) ??
        latestAutoOpenRelease() ??
        WHATS_NEW_RELEASES[0];
      if (release) showRelease(release, 'manual');
    };
    const hideForTutorial = () => setOpen(false);

    window.addEventListener(WHATS_NEW_OPEN_EVENT, show);
    window.addEventListener(TUTORIAL_OPENED_EVENT, hideForTutorial);
    window.addEventListener(TUTORIAL_CHECK_COMPLETE_EVENT, attemptAutoOpen);
    return () => {
      window.removeEventListener(WHATS_NEW_OPEN_EVENT, show);
      window.removeEventListener(TUTORIAL_OPENED_EVENT, hideForTutorial);
      window.removeEventListener(TUTORIAL_CHECK_COMPLETE_EVENT, attemptAutoOpen);
    };
  }, [attemptAutoOpen, showRelease]);

  useEffect(() => {
    if (previousPathRef.current !== pathname) {
      previousPathRef.current = pathname;
      if (openRef.current) setOpen(false);
    }
  }, [pathname]);

  return {
    open,
    selectedRelease,
    viewedReleaseIds,
    slideIndex,
    mode,
    featureCount,
    activeFeature,
    previewing: previewSessionRef.current,
    direction: directionRef.current,
    goToSlide,
    dismiss,
    complete,
    tryFeature,
    selectHistoryRelease,
    openChangelog,
    setMode,
  };
}
