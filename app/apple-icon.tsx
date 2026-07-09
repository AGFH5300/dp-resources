import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: 180, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#ffffff' }}>
        <img src="https://dp.resources.anshgupta.cc/brand/dp-logo.png" alt="DP Resources" width="168" height="168" style={{ width: 168, height: 168, objectFit: 'contain', display: 'block' }} />
      </div>
    ),
    size,
  )
}
