import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('large prepared PDF manifests', () => {
  it('fetches every page row in batches instead of relying on the Supabase 1000-row default', () => {
    const derivatives = read('lib/pdf-preview-derivatives.ts')

    expect(derivatives).toContain('const PDF_PREVIEW_PAGE_QUERY_BATCH = 500')
    expect(derivatives).toContain('async function getAllPdfPreviewPages')
    expect(derivatives).toContain('for (let start = 0; ; start += PDF_PREVIEW_PAGE_QUERY_BATCH)')
    expect(derivatives).toContain('.range(start, start + PDF_PREVIEW_PAGE_QUERY_BATCH - 1)')
    expect(derivatives).toContain('pages.push(...batch)')
    expect(derivatives).toContain('if (batch.length < PDF_PREVIEW_PAGE_QUERY_BATCH) break')
  })

  it('uses the complete paginated page list for both manifest entry points', () => {
    const derivatives = read('lib/pdf-preview-derivatives.ts')

    expect(derivatives).toContain('const pages = await getAllPdfPreviewPages(sb, document.id)')
    expect(derivatives).toContain('const pages = await getAllPdfPreviewPages(sb, previewId)')

    const directQueryPattern = /from\('dp_pdf_preview_pages'\)[\s\S]*?order\('page_number', \{ ascending: true \}\);/g
    expect(derivatives.match(directQueryPattern) || []).toHaveLength(0)
  })
})
