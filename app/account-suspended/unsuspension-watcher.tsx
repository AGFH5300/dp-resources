'use client'

import { useEffect, useMemo, useRef } from 'react'
import { createClientSupabase } from '@/lib/supabase-browser'
import { dispatchSuspensionReasonUpdated, SUSPENDED_USER_ID_STORAGE_KEY, SUSPENSION_REASON_STORAGE_KEY } from '@/components/suspension-storage'

type UnsuspensionWatcherProps = { initialUserId?: string | null }

type StatusResponse = {
  authenticated?: boolean
  suspended?: boolean
  suspensionReason?: string | null
}

type MembershipUpdate = {
  id?: string
  is_suspended?: boolean
  suspension_reason?: string | null
}

const LIBRARY_PATH = '/library'
const FALLBACK_INTERVAL_MS = 12_000

function nonEmptyString(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

export function UnsuspensionWatcher({ initialUserId }: UnsuspensionWatcherProps) {
  const navigatedRef = useRef(false)
  const userId = useMemo(() => nonEmptyString(initialUserId) ?? null, [initialUserId])

  useEffect(() => {
    const resolvedUserId = userId ?? nonEmptyString(window.sessionStorage.getItem(SUSPENDED_USER_ID_STORAGE_KEY))
    if (!resolvedUserId) return

    let active = true
    const supabase = createClientSupabase()

    function clearStoredSuspension() {
      window.sessionStorage.removeItem(SUSPENSION_REASON_STORAGE_KEY)
      window.sessionStorage.removeItem(SUSPENDED_USER_ID_STORAGE_KEY)
    }

    function storeSuspendedReason(reason: unknown) {
      if (typeof reason === 'string' && reason.length > 0) {
        window.sessionStorage.setItem(SUSPENSION_REASON_STORAGE_KEY, reason)
        dispatchSuspensionReasonUpdated(reason)
      } else if (reason === null) {
        window.sessionStorage.removeItem(SUSPENSION_REASON_STORAGE_KEY)
        dispatchSuspensionReasonUpdated(null)
      }
      window.sessionStorage.setItem(SUSPENDED_USER_ID_STORAGE_KEY, resolvedUserId as string)
    }

    function navigateToLibraryOnce() {
      if (navigatedRef.current) return
      navigatedRef.current = true
      clearStoredSuspension()
      window.location.replace(LIBRARY_PATH)
    }

    function handleMembershipUpdate(updated: MembershipUpdate | null | undefined) {
      if (!active || navigatedRef.current || updated?.id !== resolvedUserId) return
      if (updated.is_suspended === false) {
        navigateToLibraryOnce()
        return
      }
      if (updated.is_suspended === true) storeSuspendedReason(updated.suspension_reason)
    }

    async function checkStatus() {
      if (!active || navigatedRef.current) return
      try {
        const response = await fetch('/api/account/status', { cache: 'no-store' })
        if (!response.ok) return
        const status = await response.json().catch(() => null) as StatusResponse | null
        if (!active || navigatedRef.current || status?.authenticated !== true) return
        if (status.suspended === false) {
          navigateToLibraryOnce()
          return
        }
        if (status.suspended === true) storeSuspendedReason(status.suspensionReason)
      } catch {
        // Quiet fallback: realtime remains primary.
      }
    }

    const channel = supabase
      .channel(`dp-resource-unsuspension:${resolvedUserId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'dp_resource_memberships', filter: `id=eq.${resolvedUserId}` },
        (payload) => handleMembershipUpdate(payload.new as MembershipUpdate),
      )
      .subscribe()

    void checkStatus()
    const onFocus = () => void checkStatus()
    const onVisibility = () => { if (document.visibilityState === 'visible') void checkStatus() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    const interval = window.setInterval(() => void checkStatus(), FALLBACK_INTERVAL_MS)

    return () => {
      active = false
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(interval)
      void supabase.removeChannel(channel)
    }
  }, [userId])

  return null
}
