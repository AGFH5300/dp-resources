import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('standard PDF fallback', () => {
  it('uses the completed resource index and never queues previews from a web request', () => {
    const route = read('app/api/resource/[fileId]/pdf-session/route.ts')

    expect(route).toContain("import { getIndexedResourceShell } from '@/lib/indexed-resource'")
    expect(route).toContain('const indexedMeta = await getIndexedResourceShell(fileId)')
    expect(route).toContain('const meta = indexedMeta || await getDriveMetadata(fileId)')
    expect(route).toContain('getPdfPreviewDocument')
    expect(route).not.toContain('ensurePdfPreviewDocument')
    expect(route).not.toContain('dp_queue_pdf_preview')
  })

  it('returns standard mode immediately when no prepared page preview is viewable', () => {
    const route = read('app/api/resource/[fileId]/pdf-session/route.ts')

    expect(route).toContain("mode: 'standard'")
    expect(route).toContain("standardUrl: `/api/resource/${encodeURIComponent(fileId)}/content`")
    expect(route).toContain('if (!preview || !isPdfPreviewViewable(preview))')
    expect(route).toContain("mode: 'prepared'")
  })

  it('loads ordinary PDFs through a browser-local Blob reader instead of polling forever', () => {
    const viewer = read('app/resource/[fileId]/pdf-viewer.tsx')

    expect(viewer).toContain('function StandardPdfViewer')
    expect(viewer).toContain("fetch(url,{credentials:'same-origin',cache:'no-store'")
    expect(viewer).toContain('URL.createObjectURL(blob)')
    expect(viewer).toContain('URL.revokeObjectURL(objectUrl)')
    expect(viewer).toContain("next.mode==='standard'||!next.manifestUrl")
    expect(viewer).toContain('setStandardUrl(next.standardUrl||url)')
    expect(viewer).toContain('if(!response.ok){if(!stopped)setStandardUrl(url);return}')
    expect(viewer).toContain('if(standardUrl)return <StandardPdfViewer')
    expect(viewer).not.toContain('else timer=setTimeout(()=>void poll(url),4000)')
  })
})
