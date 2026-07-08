import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#ffffff' }}>
        <img src="https://dp.resources.anshgupta.cc/brand/dp-logo.png" alt="DP Resources" width="74" height="74" style={{ width: 74, height: 74, objectFit: 'contain' }} />
      </div>
    ),
    size,
  )
}
