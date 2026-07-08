import { ImageResponse } from 'next/og'
import logoMark from './ChatGPT Image Jul 8, 2026, 11_40_32 PM.png'

export const runtime = 'edge'
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff' }}>
        <img src={logoMark.src} alt="DP Resources" width="150" height="150" style={{ width: 150, height: 150, objectFit: 'contain' }} />
      </div>
    ),
    size,
  )
}
