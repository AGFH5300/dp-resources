import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#10243f', color: '#d6a84f', fontSize: 13, fontWeight: 800, fontFamily: 'Arial, sans-serif' }}>DP</div>
    ),
    size,
  )
}
