export function BrandMark({ className = '', title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={`inline-block aspect-square shrink-0 ${className}`.trim()}
    >
      <defs>
        <linearGradient id="dp-mark-blue" x1="18" y1="18" x2="74" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1f64ff" />
          <stop offset="1" stopColor="#0759ff" />
        </linearGradient>
        <linearGradient id="dp-mark-navy" x1="45" y1="76" x2="84" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#061a34" />
          <stop offset="1" stopColor="#082347" />
        </linearGradient>
        <linearGradient id="dp-mark-gold" x1="44" y1="44" x2="62" y2="61" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffc12f" />
          <stop offset="1" stopColor="#f0a410" />
        </linearGradient>
      </defs>
      <path
        d="M27 72V29c0-6.1 4.9-11 11-11h38"
        fill="none"
        stroke="url(#dp-mark-blue)"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M45 76h31c6.1 0 11-4.9 11-11V27"
        fill="none"
        stroke="url(#dp-mark-navy)"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="53" cy="50" r="8.5" fill="url(#dp-mark-gold)" />
    </svg>
  )
}
