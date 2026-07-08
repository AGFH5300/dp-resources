import Link from 'next/link'

export function BrandWordmark({ href = '/auth/login', className = '' }: { href?: string; className?: string }) {
  return (
    <Link href={href} aria-label="DP Resources" className={`inline-flex items-center gap-3 ${className}`.trim()}>
      <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <img
          src="/brand/dp-logo.png"
          alt=""
          aria-hidden="true"
          className="h-16 w-16 max-w-none object-contain"
        />
      </span>
      <span className="whitespace-nowrap text-xl font-semibold tracking-tight text-[#061a34] sm:text-2xl">
        <span className="font-extrabold">DP</span> Resources
      </span>
    </Link>
  )
}
