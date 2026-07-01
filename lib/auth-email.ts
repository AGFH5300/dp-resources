export function isValidEmail(value: string) {
  if (!value || value.length > 254 || !value.includes('@') || hasWhitespace(value)) return false

  const atIndex = value.indexOf('@')
  const domain = value.slice(atIndex + 1)

  return atIndex > 0 && atIndex === value.lastIndexOf('@') && domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.')
}

function hasWhitespace(value: string) {
  for (const character of value) {
    if (character.trim() === '') return true
  }

  return false
}
