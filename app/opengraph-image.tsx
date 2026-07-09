import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'DP Resources'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff' }}>
        <img src="https://resources.anshgupta.cc/brand/dp-wordmark.png" alt="DP Resources" width="1000" height="350" style={{ width: 1000, height: 350, objectFit: 'contain' }} />
      </div>
    ),
    size,
  )
}
