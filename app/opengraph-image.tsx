import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'DP Resources'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#f6f1e8', color: '#10243f', fontFamily: 'Arial, sans-serif', padding: 72 }}>
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid #d9ccba', borderRadius: 36, background: '#fffaf1', padding: 64 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' }}>DP Resources</div>
            <div style={{ width: 76, height: 76, borderRadius: 22, background: '#10243f', color: '#d6a84f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800 }}>DP</div>
          </div>
          <div>
            <div style={{ color: '#b5832d', fontSize: 24, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Private resource access</div>
            <div style={{ marginTop: 22, maxWidth: 850, fontSize: 72, lineHeight: 1.05, fontWeight: 800, letterSpacing: '-0.04em' }}>A focused study library for DP resources.</div>
            <div style={{ marginTop: 28, maxWidth: 760, color: '#4b5563', fontSize: 30, lineHeight: 1.35 }}>Search, preview, save, and report resources from one secure portal.</div>
          </div>
        </div>
      </div>
    ),
    size,
  )
}
