export function isSafeUrl(url: string): boolean {
  if (typeof url !== 'string') {
    return false
  }

  const trimmed = url.trim()
  if (trimmed === '') {
    return false
  }

  if (/[\x00-\x20]/.test(trimmed)) {
    return false
  }

  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed)
  if (!schemeMatch) {
    return true
  }

  const scheme = schemeMatch[1].toLowerCase()
  return scheme === 'http' || scheme === 'https'
}

export function isSafeMediaUrl(url: string): boolean {
  if (typeof url !== 'string') {
    return false
  }

  const trimmed = url.trim()
  if (trimmed === '') {
    return false
  }

  if (/[\x00-\x20]/.test(trimmed)) {
    return false
  }

  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed)
  if (!schemeMatch) {
    return true
  }

  const scheme = schemeMatch[1].toLowerCase()
  return scheme === 'http' || scheme === 'https' || scheme === 'data' || scheme === 'blob'
}
