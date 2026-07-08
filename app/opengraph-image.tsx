import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'DP Resources'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

function LogoSvg({ size = 210 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="og-blue" x1="18" y1="18" x2="76" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1f64ff" />
          <stop offset="1" stopColor="#0759ff" />
        </linearGradient>
        <linearGradient id="og-navy" x1="45" y1="76" x2="87" y2="27" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#061a34" />
          <stop offset="1" stopColor="#082347" />
        </linearGradient>
        <linearGradient id="og-gold" x1="44" y1="44" x2="62" y2="61" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffc12f" />
          <stop offset="1" stopColor="#f0a410" />
        </linearGradient>
      </defs>
      <path d="M27 72V29c0-6.1 4.9-11 11-11h38" stroke="url(#og-blue)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M45 76h31c6.1 0 11-4.9 11-11V27" stroke="url(#og-navy)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="53" cy="50" r="8.5" fill="url(#og-gold)" />
    </svg>
  )
}

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff', color: '#061a34', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 64 }}>
          <LogoSvg />
          <div style={{ display: 'flex', alignItems: 'baseline', letterSpacing: '-0.055em', color: '#061a34' }}>
            <span style={{ fontSize: 142, lineHeight: 1, fontWeight: 800 }}>DP</span>
            <span style={{ marginLeft: 24, fontSize: 124, lineHeight: 1, fontWeight: 400 }}>Resources</span>
          </div>
        </div>
      </div>
    ),
    size,
  )
}
