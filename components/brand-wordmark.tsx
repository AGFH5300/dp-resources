import Link from 'next/link'
import { BrandMark } from '@/components/brand-mark'

export function BrandWordmark({ href = '/auth/login', className = '' }: { href?: string; className?: string }) {
  return (
    <Link href={href} aria-label="DP Resources" className={`inline-flex items-center gap-2.5 font-sans tracking-tight text-[#061a34] ${className}`.trim()}>
      <BrandMark className="h-[1.75em] w-[1.75em]" />
      <span className="whitespace-nowrap leading-none">
        <span className="font-extrabold">DP</span>{' '}
        <span className="font-medium">Resources</span>
      </span>
    </Link>
  )
}
