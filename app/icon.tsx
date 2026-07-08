import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff' }}>
        <img src="https://dp.resources.anshgupta.cc/brand/dp-logo.png" alt="DP Resources" width="23" height="23" style={{ width: 23, height: 23, objectFit: 'contain', display: 'block' }} />
      </div>
    ),
    size,
  )
}
