export function BrandMark({ className = '', title }: { className?: string; title?: string }) {
  return (
    <span
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={`dp-brand-mark inline-grid aspect-square shrink-0 ${className}`.trim()}
    >
      <img src="/brand/dp-logo.png" alt="" aria-hidden="true" className="dp-logo-light col-start-1 row-start-1 size-full object-contain" />
      <img src="/brand/dp-logo-dark.png" alt="" aria-hidden="true" className="dp-logo-dark col-start-1 row-start-1 size-full object-contain" />
    </span>
  )
}
