"use client"

import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AuthShell } from '@/components/auth-shell'
import { safeInternalReturnPath } from '@/lib/auth-redirect'

const SIGNUP_DRAFT_KEY = 'dp_resource_signup_profile'
const DEFAULT_NEXT_PATH = '/library'

function readNextPath() {
  if (typeof window === 'undefined') return DEFAULT_NEXT_PATH
  return safeInternalReturnPath(new URLSearchParams(window.location.search).get('next'), DEFAULT_NEXT_PATH)
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextPath] = useState(readNextPath)
  const router = useRouter()

  useEffect(() => {
    window.sessionStorage.removeItem(SIGNUP_DRAFT_KEY)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    router.push(nextPath)
  }

  return (
    <AuthShell
      eyebrow="Sign in"
      title="Pick up exactly where you left off."
      description="Open your resource folders, recent files, and library materials in one place."
      quote="We do not learn from experience... we learn from reflecting on experience."
      attribution="John Dewey"
    >
      <h1 className="font-headline text-4xl text-[#00152a]">Log in</h1>
      <p className="mt-3 font-body text-[#43474d]">Access your DP Resources library.</p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <div><label htmlFor="login-email" className="font-label text-xs uppercase tracking-[.05em] text-[#43474d]">Email</label><input id="login-email" className="tsm-input" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required disabled={loading} /></div>
        <div>
          <label htmlFor="login-password" className="font-label text-xs uppercase tracking-[.05em] text-[#43474d]">Password</label>
          <div className="relative">
            <input id="login-password" className="tsm-input pr-10" type={showPassword ? "text" : "password"} value={password} onChange={(e)=>setPassword(e.target.value)} required disabled={loading} />
            <button
              type="button"
              className="absolute right-0 top-1/2 -translate-y-1/2 text-[#43474d] hover:text-[#00152a] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => setShowPassword((previous) => !previous)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              disabled={loading}
            >
              {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button type="submit" className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-sm bg-[#00152a] py-4 text-white transition-colors hover:bg-[#08284a] focus:outline-none focus:ring-2 focus:ring-[#00152a]/30 disabled:cursor-not-allowed disabled:opacity-70" disabled={loading || !email || !password}>{loading ? <><Loader2 className="size-4 animate-spin" /> Logging in...</> : 'Log in'}</button>
      </form>
      <p className="mt-8 border-t border-[#c3c6ce55] pt-6 text-center font-body text-[#43474d]">Don&apos;t have an account?<Link href={`/auth/sign-up${nextPath !== DEFAULT_NEXT_PATH ? `?next=${encodeURIComponent(nextPath)}` : ''}`} className="ml-1 font-semibold text-[#00152a]">Sign Up</Link></p>
    </AuthShell>
  )
}
