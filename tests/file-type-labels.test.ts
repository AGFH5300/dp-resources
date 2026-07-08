import { describe, expect, it } from 'vitest'
import { formatMimeType } from '../lib/file-type-labels'

describe('formatMimeType', () => {
  it('formats common document MIME types with friendly labels', () => {
    expect(formatMimeType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('Excel spreadsheet')
    expect(formatMimeType('application/vnd.ms-excel')).toBe('Excel spreadsheet')
    expect(formatMimeType('application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe('PowerPoint presentation')
    expect(formatMimeType('application/pdf')).toBe('PDF')
  })

  it('formats Google Workspace MIME types with friendly labels', () => {
    expect(formatMimeType('application/vnd.google-apps.spreadsheet')).toBe('Google Sheet')
    expect(formatMimeType('application/vnd.google-apps.document')).toBe('Google Doc')
    expect(formatMimeType('application/vnd.google-apps.presentation')).toBe('Google Slides')
  })

  it('uses MIME families and extensions where useful', () => {
    expect(formatMimeType('image/png')).toBe('Image')
    expect(formatMimeType('audio/mpeg')).toBe('Audio')
    expect(formatMimeType('video/mp4')).toBe('Video')
    expect(formatMimeType(null, 'archive.zip')).toBe('ZIP archive')
    expect(formatMimeType(null, 'data.csv')).toBe('CSV')
    expect(formatMimeType(null, null)).toBe('Unknown file')
  })
})
