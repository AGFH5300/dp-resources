import Link from 'next/link'
import { AppIcon } from '@/components/app-icon'
import { AuthShell } from '@/components/auth-shell'

export default function SignUpSuccessPage() {
  return (
    <AuthShell
      eyebrow="Email sent"
      title="Verification code sent."
      description="Open your inbox, copy the code, then continue sign-up."
    >
      <div className="text-center">
        <div className="mb-8 inline-flex h-20 w-20 items-center justify-center rounded-full border border-[#c3c6ce66] bg-[#f5f3ee]">
          <AppIcon name="mark_email_read" className="size-10 text-[#735b2b]" />
        </div>
        <h1 className="font-headline text-4xl text-[#00152a]">Verification email sent</h1>
        <p className="mt-4 font-body text-[#43474d]">Check your inbox for your code and continue verification.</p>
        <Link href="/auth/login" className="mt-8 block w-full bg-[#00152a] py-4 text-white rounded-sm">Return to Log In</Link>
      </div>
    </AuthShell>
  )
}
