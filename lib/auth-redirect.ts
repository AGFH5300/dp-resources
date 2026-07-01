const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/
const BACKSLASH = /\\/

export function safeInternalReturnPath(value: string | null | undefined, fallback: string) {
  if (!value) return fallback
  let decoded = value
  try {
    for (let i = 0; i < 2; i += 1) {
      const next = decodeURIComponent(decoded)
      if (next === decoded) break
      decoded = next
    }
  } catch {
    return fallback
  }
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return fallback
  if (CONTROL_CHARACTERS.test(decoded) || BACKSLASH.test(decoded)) return fallback
  try {
    const parsed = new URL(decoded, 'https://example.invalid')
    if (parsed.origin !== 'https://example.invalid') return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}
