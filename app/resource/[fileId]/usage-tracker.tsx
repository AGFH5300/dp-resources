'use client';
import { useEffect, useRef } from 'react';

export function ResourceUsageTracker({ fileId }: { fileId: string }) {
  const sessionRef = useRef<string | null>(null);
  const lastActivity = useRef(Date.now());
  useEffect(() => {
    let stopped = false;
    let requestInFlight = false;
    let wasVisible = document.visibilityState === 'visible';
    let wasFocused = document.hasFocus();
    let lastSubmittedAt = Date.now();

    const active = () => {
      lastActivity.current = Date.now();
    };
    const recentlyActive = () => Date.now() - lastActivity.current < 120_000;
    const isActive = () => wasVisible && wasFocused && recentlyActive();

    async function start() {
      if (sessionRef.current || stopped) return;
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
      if (!sessionRef.current) {
        if (isActive()) void start();
        return;
      }
      if (requestInFlight) return;

      const submittedAt = Date.now();
      const pageVisible = isActive();
      const deltaSeconds = pageVisible
        ? Math.max(0, Math.floor((submittedAt - lastSubmittedAt) / 1000))
        : 0;

      requestInFlight = true;
      const response = await fetch(
        `/api/resource-usage/${sessionRef.current}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pageVisible,
            wasActive: pageVisible,
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
      if (document.visibilityState === 'hidden') {
        sendBeacon(false, wasVisible && wasFocused && recentlyActive());
        wasVisible = false;
        return;
      }

      wasVisible = true;
      lastSubmittedAt = Date.now();
      active();
      if (!sessionRef.current) void start();
    }

    function onFocus() {
      wasFocused = true;
      lastSubmittedAt = Date.now();
      active();
      if (!sessionRef.current) void start();
    }

    function onBlur() {
      sendBeacon(false, wasVisible && wasFocused && recentlyActive());
      wasFocused = false;
    }

    function onPageHide(event: PageTransitionEvent) {
      const shouldCredit = wasVisible && wasFocused && recentlyActive();
      if (event.persisted) {
        sendBeacon(false, shouldCredit);
        return;
      }
      stopped = true;
      sendBeacon(true, shouldCredit);
    }

    function onPageShow() {
      stopped = false;
      wasVisible = document.visibilityState === 'visible';
      wasFocused = document.hasFocus();
      lastSubmittedAt = Date.now();
      active();
      if (!sessionRef.current) void start();
    }

    function end() {
      if (stopped && !sessionRef.current) return;
      stopped = true;
      sendBeacon(true, wasVisible && wasFocused && recentlyActive());
    }

    ['mousemove', 'keydown', 'pointerdown', 'scroll', 'touchstart'].forEach(
      (eventName) =>
        window.addEventListener(eventName, active, { passive: true }),
    );
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    void start();
    const timer = window.setInterval(() => void heartbeat(), 10_000);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      ['mousemove', 'keydown', 'pointerdown', 'scroll', 'touchstart'].forEach(
        (eventName) => window.removeEventListener(eventName, active),
      );
      end();
    };
  }, [fileId]);
  return null;
}
