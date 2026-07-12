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
    expect(viewer).toContain('activeSlideRef.current?.scrollIntoView')
  })
  it('centres and constrains the browser-rendered PPTX within the stage', () => {
    expect(viewer).toContain('overflow-auto bg-slate-200 p-4')
    expect(viewer).toContain('pptx-preview-wrapper')
    expect(viewer).toContain('getBoundingClientRect().width - 32')
    expect(viewer).not.toContain('<canvas')
  })
  it('shows a visible staged loading progress bar during browser rendering', () => {
    expect(source).toContain('PresentationLoadingOverlay')
    expect(source).toContain('Preparing presentation preview')
    expect(source).toContain('Rendering slides in your browser')
    expect(source).toContain('Large PPTX files can take a short moment to load.')
    expect(source).not.toContain('while LibreOffice converts')
  })
  it('offers download fallback from the PPTX failure panel and toolbar', () => {
    expect(viewer).toContain('>Download</a>')
    expect(source).toContain('Download presentation')
    expect(source).toContain('/api/files/${fileId}/download')
  })
})
