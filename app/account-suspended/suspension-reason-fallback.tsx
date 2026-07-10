'use client'

import { useEffect, useState } from 'react'
import { SUSPENSION_REASON_STORAGE_KEY } from '@/components/suspension-storage'

export function SuspensionReasonFallback({ initialReason }: { initialReason: string | null }) {
  const [reason, setReason] = useState(initialReason)

  useEffect(() => {
    if (initialReason) return
    const stored = window.sessionStorage.getItem(SUSPENSION_REASON_STORAGE_KEY)
    if (stored) setReason(stored)
  }, [initialReason])

  if (!reason) return null

  return (
    <section className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950" aria-label="Reason for suspension">
      <h2 className="text-sm font-semibold uppercase tracking-[0.16em]">Reason for suspension</h2>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{reason}</p>
    </section>
  )
}

export function ClearSuspensionReasonButton({ className }: { className: string }) {
  return (
    <button
      className={className}
      type="submit"
      onClick={() => window.sessionStorage.removeItem(SUSPENSION_REASON_STORAGE_KEY)}
    >
      Sign out
    </button>
  )
}
