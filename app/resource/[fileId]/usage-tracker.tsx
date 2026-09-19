'use client';
import { useEffect, useRef } from 'react';

export function ResourceUsageTracker({ fileId }: { fileId: string }) {
  const sessionRef = useRef<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let requestInFlight = false;
    let wasVisible = document.visibilityState === 'visible';
    let lastSubmittedAt = Date.now();

    const isActive = () => wasVisible;

    async function start() {
      if (sessionRef.current || stopped || !isActive()) return;
      const res = await fetch('/api/resource-usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
      }).catch(() => null);
      const json = await res?.json().catch(() => null);
      if (json?.sessionId) {
        sessionRef.current = json.sessionId;
        lastSubmittedAt = Date.now();
      }
    }

    async function heartbeat() {
      if (!isActive()) return;

      if (!sessionRef.current) {
        void start();
        return;
      }
      if (requestInFlight) return;

      const submittedAt = Date.now();
      const deltaSeconds = Math.max(
        0,
        Math.floor((submittedAt - lastSubmittedAt) / 1000),
      );

      requestInFlight = true;
      const response = await fetch(
        `/api/resource-usage/${sessionRef.current}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pageVisible: true,
            wasActive: true,
            deltaSeconds,
          }),
        },
      ).catch(() => null);
      requestInFlight = false;
      if (response?.ok) lastSubmittedAt = submittedAt;
    }

    function sendBeacon(end: boolean, wasActive: boolean) {
      const id = sessionRef.current;
      if (!id) return;

      const submittedAt = Date.now();
      const deltaSeconds = wasActive
        ? Math.max(0, Math.floor((submittedAt - lastSubmittedAt) / 1000))
        : 0;
      lastSubmittedAt = submittedAt;
      const url = `/api/resource-usage/${id}`;
      const body = JSON.stringify({
        end,
        pageVisible: false,
        wasActive,
        deltaSeconds,
      });

      const sent = navigator.sendBeacon
        ? navigator.sendBeacon(
            url,
            new Blob([body], { type: 'application/json' }),
          )
        : false;
      if (!sent) {
        void fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => undefined);
      }

      if (end) sessionRef.current = null;
    }

    function onVisibilityChange() {
      const visible = document.visibilityState === 'visible';

      if (!visible) {
        sendBeacon(false, wasVisible);
        wasVisible = false;
        return;
      }

      wasVisible = true;
      lastSubmittedAt = Date.now();
      if (!sessionRef.current) void start();
    }

    function onFullscreenChange() {
      wasVisible = document.visibilityState === 'visible';
      if (!wasVisible) return;
      if (!sessionRef.current) {
        void start();
        return;
      }
      void heartbeat();
    }

    function onPageHide(event: PageTransitionEvent) {
      const shouldCredit = wasVisible;
      if (event.persisted) {
        sendBeacon(false, shouldCredit);
        wasVisible = false;
        return;
      }
      stopped = true;
      sendBeacon(true, shouldCredit);
    }

    function onPageShow() {
      stopped = false;
      wasVisible = document.visibilityState === 'visible';
      lastSubmittedAt = Date.now();
      if (wasVisible && !sessionRef.current) void start();
    }

    function end() {
      if (stopped && !sessionRef.current) return;
      stopped = true;
      sendBeacon(true, wasVisible);
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    void start();
    const timer = window.setInterval(() => void heartbeat(), 10_000);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      end();
    };
  }, [fileId]);

  return null;
}
