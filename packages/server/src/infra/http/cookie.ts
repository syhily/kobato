export interface CookieAttributes {
  maxAge?: number
  expires?: Date
  path?: string
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'lax' | 'strict' | 'none'
}

const COOKIE_MAX_AGE_LIMIT = 3456e4

const SAME_SITE_LABELS: Record<'lax' | 'strict' | 'none', string> = {
  lax: 'Lax',
  strict: 'Strict',
  none: 'None',
}

function trimCookieSlice(str: string, min: number, max: number): string {
  let start = min
  let end = max
  while (start < end) {
    const code = str.charCodeAt(start)
    if (code !== 32 && code !== 9) {
      break
    }
    start++
  }
  while (end > start) {
    const code = str.charCodeAt(end - 1)
    if (code !== 32 && code !== 9) {
      break
    }
    end--
  }
  return str.slice(start, end)
}

function decodeCookieComponent(value: string): string {
  if (!value.includes('%')) {
    return value
  }
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function parseCookieValue(header: string, name: string): string | null {
  const len = header.length
  if (len < 2) {
    return null
  }
  let index = 0
  do {
    const eqIdx = header.indexOf('=', index)
    if (eqIdx === -1) {
      break
    }
    const semiIdx = header.indexOf(';', index)
    const endIdx = semiIdx === -1 ? len : semiIdx
    if (eqIdx > endIdx) {
      index = header.lastIndexOf(';', eqIdx - 1) + 1
      continue
    }
    if (trimCookieSlice(header, index, eqIdx) === name) {
      return decodeCookieComponent(trimCookieSlice(header, eqIdx + 1, endIdx))
    }
    index = endIdx + 1
  } while (index < len)
  return null
}

export function serializeCookie(name: string, value: string, attributes: CookieAttributes = {}): string {
  let str = `${name}=${value === '' ? '' : encodeURIComponent(value)}`
  if (attributes.maxAge !== undefined) {
    str += `; Max-Age=${Math.max(0, Math.min(attributes.maxAge, COOKIE_MAX_AGE_LIMIT))}`
  }
  if (attributes.path) {
    str += `; Path=${attributes.path}`
  }
  if (attributes.expires) {
    str += `; Expires=${attributes.expires.toUTCString()}`
  }
  if (attributes.httpOnly) {
    str += '; HttpOnly'
  }
  if (attributes.secure) {
    str += '; Secure'
  }
  if (attributes.sameSite) {
    str += `; SameSite=${SAME_SITE_LABELS[attributes.sameSite]}`
  }
  return str
}
