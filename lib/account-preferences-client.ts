'use client';

import { useEffect, useSyncExternalStore } from 'react';

import {
  DEFAULT_ACCOUNT_PREFERENCES,
  normalizeAccountPreferences,
  type AccountPreferences,
} from '@/lib/account-settings';

const STORAGE_KEY = 'dp-account-preferences-v1';

type AccountPreferenceState = {
  preferences: AccountPreferences;
  ready: boolean;
};

const serverSnapshot: AccountPreferenceState = {
  preferences: DEFAULT_ACCOUNT_PREFERENCES,
  ready: false,
};

let snapshot: AccountPreferenceState = serverSnapshot;
let remoteLoad: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setSnapshot(
  next: AccountPreferences,
  { persist = true, ready = true }: { persist?: boolean; ready?: boolean } = {},
) {
  snapshot = {
    preferences: normalizeAccountPreferences(next),
    ready,
  };
  if (persist && typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(snapshot.preferences),
      );
    } catch {
      // Preferences remain usable in-memory when browser storage is unavailable.
    }
  }
  emit();
}

function markReady() {
  if (snapshot.ready) return;
  snapshot = { ...snapshot, ready: true };
  emit();
}

function hydrateLocalPreferences() {
  if (typeof window === 'undefined') return false;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return false;
    const parsed = JSON.parse(stored) as Partial<AccountPreferences>;
    setSnapshot(normalizeAccountPreferences(parsed), { persist: false, ready: true });
    return true;
  } catch {
    return false;
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
    .finally(() => {
      markReady();
    });
  return remoteLoad;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function usePreferenceState() {
  const state = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => serverSnapshot,
  );

  useEffect(() => {
    hydrateLocalPreferences();
    void loadRemotePreferences();
  }, []);

  return state;
}

export function useAccountPreferences() {
  return usePreferenceState().preferences;
}

export function useAccountPreferenceState() {
  return usePreferenceState();
}

export function publishAccountPreferences(next: AccountPreferences) {
  setSnapshot(normalizeAccountPreferences(next));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('dp:account-preferences-changed'));
    window.dispatchEvent(new Event('dp:notifications-changed'));
  }
}

export function refreshAccountPreferences() {
  remoteLoad = null;
  return loadRemotePreferences();
}
