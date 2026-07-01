export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex aspect-square items-center justify-center rounded-sm bg-[#00152a] px-1.5 font-headline text-[0.6em] font-semibold leading-none text-white ${className}`.trim()}
    >
      DP
    </span>
  )
}
