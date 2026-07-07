'use client'
import { useEffect, useRef } from 'react'

export function ResourceUsageTracker({ fileId }: { fileId: string }) {
  const sessionRef = useRef<string | null>(null)
  const lastActivity = useRef(Date.now())
  useEffect(() => {
    let stopped = false
    const active = () => { lastActivity.current = Date.now() }
    const isActive = () => document.visibilityState === 'visible' && document.hasFocus() && Date.now() - lastActivity.current < 120_000
    async function start() {
      if (sessionRef.current || stopped) return
      const res = await fetch('/api/resource-usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId }) }).catch(() => null)
      const json = await res?.json().catch(() => null)
      if (json?.sessionId) sessionRef.current = json.sessionId
    }
    function heartbeat() {
      if (!sessionRef.current) { if (isActive()) void start(); return }
      void fetch(`/api/resource-usage/${sessionRef.current}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageVisible: isActive() }) }).catch(() => undefined)
    }
    function end() {
      stopped = true
      const id = sessionRef.current
      if (!id) return
      const url = `/api/resource-usage/${id}`
      if (navigator.sendBeacon) navigator.sendBeacon(url, new Blob([], { type: 'application/json' }))
      else void fetch(url, { method: 'DELETE', keepalive: true }).catch(() => undefined)
    }
    ;['mousemove','keydown','pointerdown','scroll','touchstart'].forEach(e => window.addEventListener(e, active, { passive: true }))
    window.addEventListener('pagehide', end)
    void start()
    const timer = window.setInterval(heartbeat, 18_000)
    return () => { window.clearInterval(timer); window.removeEventListener('pagehide', end); ['mousemove','keydown','pointerdown','scroll','touchstart'].forEach(e => window.removeEventListener(e, active)); end() }
  }, [fileId])
  return null
}
