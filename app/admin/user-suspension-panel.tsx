'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { ResourceMembership } from '@/lib/types'

const PROTECTED_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'ymail.com',
  'icloud.com', 'me.com', 'mac.com', 'proton.me', 'protonmail.com', 'aol.com',
])

type UserSuspensionPanelProps = {
  users: ResourceMembership[]
  currentAdminId: string
}

function domainFromEmail(email: string) {
  return email.toLowerCase().split('@').pop() ?? ''
}

export function UserSuspensionPanel({ users, currentAdminId }: UserSuspensionPanelProps) {
  const router = useRouter()
  const [openUserId, setOpenUserId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [blockDomain, setBlockDomain] = useState(false)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)

  async function patchUser(user: ResourceMembership, payload: Record<string, unknown>) {
    setBusyUserId(user.id)
    try {
      const response = await fetch(`/api/admin/users/${user.id}/suspension`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Could not update suspension.')
      toast.success(payload.suspended === false ? 'User unsuspended.' : 'User suspended.')
      if (Array.isArray(result.warnings)) result.warnings.forEach((warning: unknown) => typeof warning === 'string' && toast.warning(warning))
      setOpenUserId(null)
      setReason('')
      setBlockDomain(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update suspension.')
    } finally {
      setBusyUserId(null)
    }
  }

  if (!users.length) return null

  return (
    <section className="mt-6 rounded-md border border-[#c3c6ce55] bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[#00152a]">User suspension</h2>
        <p className="mt-1 text-sm text-[#43474d]">Suspension blocks application access while retaining profile, activity, download and analytics history for administrators.</p>
      </div>
      <div className="space-y-3">
        {users.map((user) => {
          const domain = domainFromEmail(user.email)
          const protectedDomain = PROTECTED_EMAIL_DOMAINS.has(domain)
          const canSuspend = user.id !== currentAdminId && user.role !== 'admin' && !user.is_suspended
          const canUnsuspend = user.role !== 'admin' && user.is_suspended
          return (
            <div key={user.id} className="rounded border border-[#c3c6ce55] p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="font-medium text-[#00152a]">{user.email}</p>
                  <p className="text-sm text-[#43474d]">Role: {user.role} · Status: {user.is_suspended ? 'Suspended' : 'Active'}</p>
                  {user.suspended_at ? <p className="text-sm text-[#6b7280]">Suspended {new Date(user.suspended_at).toLocaleString()}</p> : null}
                  {user.suspension_reason ? <p className="text-sm text-[#7f1d1d]">Reason: {user.suspension_reason}</p> : null}
                </div>
                <div className="flex gap-2">
                  {canSuspend ? <button className="rounded border border-red-200 px-3 py-1 text-sm text-red-700 hover:bg-red-50" onClick={() => setOpenUserId(user.id)}>Suspend</button> : null}
                  {canUnsuspend ? <button className="rounded border border-emerald-200 px-3 py-1 text-sm text-emerald-700 hover:bg-emerald-50" disabled={busyUserId === user.id} onClick={() => { if (confirm(`Unsuspend ${user.email}?`)) void patchUser(user, { suspended: false }) }}>Unsuspend</button> : null}
                </div>
              </div>
              {openUserId === user.id ? (
                <form className="mt-3 space-y-3 rounded bg-slate-50 p-3" onSubmit={(event) => { event.preventDefault(); void patchUser(user, { suspended: true, reason, blockDomain }) }}>
                  <label className="block text-sm font-medium text-[#00152a]">Suspension reason
                    <textarea className="mt-1 w-full rounded border border-[#c3c6ce] p-2" value={reason} minLength={3} maxLength={500} required onChange={(event) => setReason(event.target.value)} />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[#43474d]">
                    <input type="checkbox" checked={blockDomain && !protectedDomain} disabled={protectedDomain} onChange={(event) => setBlockDomain(event.target.checked)} />
                    Also block this email domain
                  </label>
                  {protectedDomain ? <p className="text-sm text-amber-700">Mainstream provider domains such as {domain} cannot be blocked.</p> : null}
                  <div className="flex gap-2">
                    <button className="rounded bg-red-700 px-3 py-1 text-sm text-white disabled:opacity-60" disabled={busyUserId === user.id}>Confirm suspension</button>
                    <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => setOpenUserId(null)}>Cancel</button>
                  </div>
                </form>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
