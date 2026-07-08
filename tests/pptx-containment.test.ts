import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'

describe('PPTX viewer containment', () => {
  const source = readFileSync('app/resource/[fileId]/resource-preview.tsx', 'utf8')
  const viewer = source.slice(source.indexOf('function PresentationViewer'), source.indexOf('function PdfViewer'))
  it('has bounded normal-page height and overflow-hidden shell without an extra top border', () => {
    expect(viewer).toContain('h-[min(78dvh,calc(100dvh-9rem))]')
    expect(viewer).toContain('min-h-[520px]')
    expect(viewer).toContain('overflow-hidden')
    expect(viewer).not.toContain('border-y border-slate-200')
  })
  it('uses fixed header and grid columns with min-h-0', () => {
    expect(viewer).toContain('shrink-0 flex items-center')
    expect(viewer).toContain('grid-cols-[112px_minmax(0,1fr)]')
    expect(viewer).toContain('min-h-0 flex-1')
  })
  it('keeps slide rail independently scrollable and active slide in view', () => {
    expect(viewer).toContain('aria-label="Slide picker"')
    expect(viewer).toContain('min-h-0 overflow-y-auto')
    expect(viewer).toContain('activeSlideRef.current?.scrollIntoView')
    expect(viewer).toContain('maxPicker=Math.min(pages,200)')
  })
  it('centres and constrains the canvas within the stage', () => {
    expect(viewer).toContain('place-items-center overflow-auto')
    expect(viewer).toContain('(stageSize.width-32)/base.width')
    expect(viewer).toContain('(stageSize.height-32)/base.height')
    expect(viewer).toContain('className="max-h-full max-w-full bg-white shadow"')
  })
  it('shows a visible staged loading progress bar during server conversion', () => {
    expect(source).toContain('PresentationLoadingOverlay')
    expect(source).toContain('Preparing presentation preview')
    expect(source).toContain('Converting presentation to PDF')
    expect(source).toContain('Large PPTX files can take a short moment to load.')
    expect(source).not.toContain('while LibreOffice converts')
  })
  it('does not duplicate the top-level resource download button inside the PPTX toolbar', () => {
    expect(viewer).not.toContain('>Download</a>')
    expect(viewer).not.toContain('/api/files/${fileId}/download')
  })
})
