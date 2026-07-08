import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

function LogoSvg({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <path d="M27 72V29c0-6.1 4.9-11 11-11h38" stroke="#1764ff" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M45 76h31c6.1 0 11-4.9 11-11V27" stroke="#061a34" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="53" cy="50" r="8.5" fill="#f3aa16" />
    </svg>
  )
}

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff' }}>
        <LogoSvg size={32} />
      </div>
    ),
    size,
  )
}
