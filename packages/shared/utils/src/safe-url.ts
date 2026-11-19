function hasControlChar(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0)
    if (code !== undefined && (code <= 0x1f || code === 0x7f)) {
      return true
    }
  }
  return false
}

export function safeHref(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  const trimmed = value.trim()
  if (trimmed === '') {
    return undefined
  }
  return isHttpUrl(trimmed) ? trimmed : undefined
}

export function safeRedirectPath(value: string | null | undefined, fallback: string, origin: string): string {
  if (value === null || value === undefined) {
    return fallback
  }
  const trimmed = value.trim()
  if (trimmed === '' || hasControlChar(trimmed)) {
    return fallback
  }

  try {
    const base = new URL(origin)
    const url = new URL(trimmed, base)
    if (url.origin !== base.origin) {
      return fallback
    }
    if (!url.pathname.startsWith('/') || url.pathname.startsWith('//')) {
      return fallback
    }
    const path = `${url.pathname}${url.search}${url.hash}`
    return hasControlChar(path) ? fallback : path
  } catch {
    return fallback
  }
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function tryParseUrl(raw: string): URL | null {
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

export function redactUrlForLog(raw: string): string {
  const parsed = tryParseUrl(raw)
  if (parsed === null) {
    return '<unparsable>'
  }
  return `${parsed.origin}${parsed.pathname}`
}
