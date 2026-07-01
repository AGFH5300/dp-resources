import Link from 'next/link'
import { BrandMark } from '@/components/brand-mark'

export function BrandWordmark({ href = '/auth/login', className = '' }: { href?: string; className?: string }) {
  return (
    <Link href={href} aria-label="DP Resources" className={`inline-flex items-center gap-2 font-headline tracking-tight text-[#00152a] ${className}`.trim()}>
      <BrandMark className="h-7 w-auto" />
      <span>DP Resources</span>
    </Link>
  )
}
