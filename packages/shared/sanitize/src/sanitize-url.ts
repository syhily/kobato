function stripControlChars(str: string): string {
  let result = ''
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code >= 0x20) {
      result += str[i]!
    }
  }
  return result
}

export function isSafeUrl(url: string): boolean {
  const stripped = stripControlChars(url).trim()
  if (stripped.length === 0) {
    return false
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(stripped)
  if (hasScheme) {
    return /^(https?|mailto|tel):/i.test(stripped)
  }

  return true
}

export function sanitizeUrl(url: string, fallback = '#'): string {
  const stripped = stripControlChars(url).trim()
  if (stripped.length === 0) {
    return fallback
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(stripped)
  if (hasScheme) {
    return /^(https?|mailto|tel):/i.test(stripped) ? stripped : fallback
  }

  return stripped
}
