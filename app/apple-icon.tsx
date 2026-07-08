import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

function LogoSvg({ size = 150 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="apple-blue" x1="18" y1="18" x2="76" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1f64ff" />
          <stop offset="1" stopColor="#0759ff" />
        </linearGradient>
        <linearGradient id="apple-navy" x1="45" y1="76" x2="87" y2="27" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#061a34" />
          <stop offset="1" stopColor="#082347" />
        </linearGradient>
      </defs>
      <path d="M27 72V29c0-6.1 4.9-11 11-11h38" stroke="url(#apple-blue)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M45 76h31c6.1 0 11-4.9 11-11V27" stroke="url(#apple-navy)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="53" cy="50" r="8.5" fill="#f3aa16" />
    </svg>
  )
}

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff' }}>
        <LogoSvg />
      </div>
    ),
    size,
  )
}
