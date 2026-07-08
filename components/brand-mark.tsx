export function BrandMark({ className = '', title }: { className?: string; title?: string }) {
  return (
    <img
      src="/brand/dp-logo.png"
      alt={title ?? ''}
      aria-hidden={title ? undefined : true}
      className={`inline-block aspect-square shrink-0 object-contain ${className}`.trim()}
    />
  )
}
