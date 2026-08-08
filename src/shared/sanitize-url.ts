/**
 * Shared URL sanitization for href attributes. Control characters are stripped first
 * (browsers ignore them when parsing URL protocols, so `java\tscript:` is a real bypass).
 * Protocol whitelist: http(s), mailto, tel, relative paths, anchors, protocol-relative.
 */

/**
 * Strip C0 control characters (U+0000–U+001F). Non-regex on purpose:
 * the `no-control-regex` lint rule flags control chars in regexes.
 */
function stripControlChars(str: string): string {
  let result = ''
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    // U+0020 (space) and above are printable / allowed.
    if (code >= 0x20) {
      result += str[i]!
    }
  }
  return result
}

/** True when the URL is safe for an `href`: no javascript/data/vbscript
 *  protocol, no control-character smuggling, no empty URLs. */
export function isSafeUrl(url: string): boolean {
  const stripped = stripControlChars(url).trim()
  if (stripped.length === 0) {
    return false
  }

  // If the URL has a protocol scheme, only allow an explicit whitelist.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(stripped)
  if (hasScheme) {
    return /^(https?|mailto|tel):/i.test(stripped)
  }

  // Relative paths, anchor links, protocol-relative URLs — allow.
  return true
}

/** Pass-through of clean URLs (control chars stripped); otherwise `fallback` (default `'#'`). */
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
