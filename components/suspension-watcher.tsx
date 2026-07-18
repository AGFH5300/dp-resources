'use client';

import { useEffect, useRef } from 'react';
import { createClientSupabase } from '@/lib/supabase-browser';
import {
  SUSPENDED_USER_ID_STORAGE_KEY,
  SUSPENSION_REASON_STORAGE_KEY,
} from '@/components/suspension-storage';

type SuspensionWatcherProps = { userId?: string | null };

const ACCOUNT_SUSPENDED_PATH = '/account-suspended';

export function SuspensionWatcher({ userId }: SuspensionWatcherProps) {
  const navigatedRef = useRef(false);

  useEffect(() => {
    if (!userId || navigatedRef.current) return;

    let active = true;
    const supabase = createClientSupabase();

    function storeSuspension(reason: unknown) {
      window.sessionStorage.setItem(
        SUSPENDED_USER_ID_STORAGE_KEY,
        userId as string,
      );
      if (typeof reason === 'string' && reason.length > 0) {
        window.sessionStorage.setItem(SUSPENSION_REASON_STORAGE_KEY, reason);
      }
    }

    function clearSuspensionStorage() {
      window.sessionStorage.removeItem(SUSPENSION_REASON_STORAGE_KEY);
      window.sessionStorage.removeItem(SUSPENDED_USER_ID_STORAGE_KEY);
    }

    function redirectOnce() {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      window.location.replace(ACCOUNT_SUSPENDED_PATH);
    }

    async function checkStatus() {
      if (!active || navigatedRef.current) return;
      try {
        const response = await fetch('/api/account/status', {
          cache: 'no-store',
        });
        if (!response.ok) return;
        const status = await response.json().catch(() => null);
        if (!active || status?.authenticated !== true) return;
        if (status.suspended === true) {
          storeSuspension(status.suspensionReason);
          redirectOnce();
          return;
        }
        clearSuspensionStorage();
      } catch {
        // Quiet fallback: realtime remains primary and active users are not refreshed.
      }
    }

    const channel = supabase
      .channel(`dp-resource-membership-status:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'dp_resource_memberships',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new as {
            id?: string;
            is_suspended?: boolean;
            suspension_reason?: string | null;
          };
          if (
            updated?.id === userId &&
            updated.is_suspended === true &&
            !navigatedRef.current
          ) {
            storeSuspension(updated.suspension_reason);
            redirectOnce();
          }
        },
      )
      .subscribe();

    const onFocus = () => void checkStatus();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void checkStatus();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    const interval = window.setInterval(() => void checkStatus(), 30000);

    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return null;
}
