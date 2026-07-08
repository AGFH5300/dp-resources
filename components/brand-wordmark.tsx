import Image from 'next/image'
import Link from 'next/link'
import logoWordmark from '@/app/ChatGPT Image Jul 8, 2026, 11_39_05 PM.png'

export function BrandWordmark({ href = '/auth/login', className = '' }: { href?: string; className?: string }) {
  return (
    <Link href={href} aria-label="DP Resources" className={`inline-flex items-center ${className}`.trim()}>
      <Image
        src={logoWordmark}
        alt="DP Resources"
        className="h-[2.35em] w-auto object-contain"
        priority
      />
    </Link>
  )
}
