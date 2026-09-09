'use client';

import { useEffect, useSyncExternalStore } from 'react';

import {
  DEFAULT_ACCOUNT_PREFERENCES,
  normalizeAccountPreferences,
  type AccountPreferences,
} from '@/lib/account-settings';

const STORAGE_KEY = 'dp-account-preferences-v1';

let snapshot: AccountPreferences = DEFAULT_ACCOUNT_PREFERENCES;
let remoteLoad: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setSnapshot(next: AccountPreferences, persist = true) {
  snapshot = normalizeAccountPreferences(next);
  if (persist && typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Preferences remain usable in-memory when browser storage is unavailable.
    }
  }
  emit();
}

function hydrateLocalPreferences() {
  if (typeof window === 'undefined') return;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    const parsed = JSON.parse(stored) as Partial<AccountPreferences>;
    setSnapshot(normalizeAccountPreferences(parsed), false);
  } catch {
    // Ignore malformed or inaccessible local preference state.
  }
}

async function loadRemotePreferences() {
  if (remoteLoad) return remoteLoad;
  remoteLoad = fetch('/api/account/settings', {
    cache: 'no-store',
    credentials: 'same-origin',
  })
    .then(async (response) => {
      if (!response.ok) return;
      const payload = (await response.json().catch(() => null)) as
        | { preferences?: Partial<AccountPreferences> }
        | null;
      if (payload?.preferences) {
        setSnapshot(normalizeAccountPreferences(payload.preferences));
      }
    })
    .catch(() => undefined)
    .then(() => undefined);
  return remoteLoad;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAccountPreferences() {
  const preferences = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => DEFAULT_ACCOUNT_PREFERENCES,
  );

  useEffect(() => {
    hydrateLocalPreferences();
    void loadRemotePreferences();
  }, []);

  return preferences;
}

export function publishAccountPreferences(next: AccountPreferences) {
  setSnapshot(normalizeAccountPreferences(next));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('dp:account-preferences-changed'));
  }
}

export function refreshAccountPreferences() {
  remoteLoad = null;
  return loadRemotePreferences();
}
