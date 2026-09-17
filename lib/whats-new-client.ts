'use client';

import {
  WHATS_NEW_ANALYTICS_EVENT,
  WHATS_NEW_RELEASE,
  WHATS_NEW_SEEN_EVENT,
  WHATS_NEW_SEEN_STORAGE_KEY,
  WHATS_NEW_SEEN_VALUE,
  WHATS_NEW_STATE_EVENT,
  WHATS_NEW_VIEWED_RELEASES_STORAGE_KEY,
} from '@/lib/whats-new';

export type WhatsNewAnalyticsEventName =
  | 'whats_new_opened'
  | 'whats_new_slide_viewed'
  | 'whats_new_try_it_clicked'
  | 'whats_new_completed'
  | 'whats_new_dismissed'
  | 'whats_new_reopened';

function cleanReleaseIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter(
        (releaseId): releaseId is string =>
          typeof releaseId === 'string' && releaseId.length > 0 && releaseId.length <= 120,
      ),
    ),
  );
}

export function readLocalViewedReleaseIds(): string[] {
  if (typeof window === 'undefined') return [];

  const viewed = new Set<string>();
  try {
    const raw = window.localStorage.getItem(
      WHATS_NEW_VIEWED_RELEASES_STORAGE_KEY,
    );
    if (raw) {
      cleanReleaseIds(JSON.parse(raw)).forEach((releaseId) =>
        viewed.add(releaseId),
      );
    }

    // Preserve the original September 2026 seen key so existing users are not
    // shown the same release again after this experience ships.
    if (
      window.localStorage.getItem(WHATS_NEW_SEEN_STORAGE_KEY) ===
      WHATS_NEW_SEEN_VALUE
    ) {
      viewed.add(WHATS_NEW_RELEASE.id);
    }
  } catch {
    // Private browsing / disabled storage must not break the update experience.
  }
  return Array.from(viewed);
}

export function writeLocalViewedReleaseIds(releaseIds: readonly string[]) {
  if (typeof window === 'undefined') return;
  const normalized = cleanReleaseIds(releaseIds);
  try {
    window.localStorage.setItem(
      WHATS_NEW_VIEWED_RELEASES_STORAGE_KEY,
      JSON.stringify(normalized),
    );
    if (normalized.includes(WHATS_NEW_RELEASE.id)) {
      window.localStorage.setItem(
        WHATS_NEW_SEEN_STORAGE_KEY,
        WHATS_NEW_SEEN_VALUE,
      );
    }
  } catch {
    // The account-backed state remains available when local storage is blocked.
  }

  window.dispatchEvent(
    new CustomEvent(WHATS_NEW_STATE_EVENT, {
      detail: { viewedReleaseIds: normalized },
    }),
  );
  if (normalized.includes(WHATS_NEW_RELEASE.id)) {
    window.dispatchEvent(new Event(WHATS_NEW_SEEN_EVENT));
  }
}

export function markReleaseViewedLocally(releaseId: string) {
  const viewed = new Set(readLocalViewedReleaseIds());
  viewed.add(releaseId);
  writeLocalViewedReleaseIds(Array.from(viewed));
}

export async function fetchAccountViewedReleaseIds(): Promise<string[] | null> {
  try {
    const response = await fetch('/api/account/whats-new', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { viewedReleaseIds?: unknown };
    return cleanReleaseIds(payload.viewedReleaseIds);
  } catch {
    return null;
  }
}

export async function persistAccountViewedRelease(releaseId: string) {
  try {
    const response = await fetch('/api/account/whats-new', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ releaseId }),
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as { viewedReleaseIds?: unknown };
    const remote = cleanReleaseIds(payload.viewedReleaseIds);
    writeLocalViewedReleaseIds([
      ...new Set([...readLocalViewedReleaseIds(), ...remote]),
    ]);
    return true;
  } catch {
    return false;
  }
}

export function emitWhatsNewAnalytics(
  name: WhatsNewAnalyticsEventName,
  detail: Record<string, unknown>,
) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(WHATS_NEW_ANALYTICS_EVENT, {
      detail: { name, ...detail },
    }),
  );
}
