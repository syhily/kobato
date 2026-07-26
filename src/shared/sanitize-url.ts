/**
 * Shared URL sanitization for href attributes.
 *
 * Browsers strip control characters (tab, newline, null, etc.) when
 * parsing URL protocols, so `java\tscript:alert(1)` is equivalent to
 * `javascript:alert(1)` at runtime; stripping them before validation
 * closes this class of bypass.
 *
 * Protocol policy (whitelist): http, https, mailto, tel, plus relative
 * paths, anchors (#) and protocol-relative (//); everything else with a
 * scheme (javascript, data, vbscript, …) is blocked.
 *
 * Referenced by the PT schema (`linkMarkDefSchema`), the PT React
 * renderer, and the server PT→HTML renderer.
 */

/**
 * Strip C0 control characters (U+0000–U+001F) from a string — browsers
 * ignore them when parsing URL protocols (see the module header).
 *
 * Uses a non-regex implementation to avoid triggering the
 * `no-control-regex` lint rule, which correctly flags that matching
 * control characters in regular expressions is usually a mistake —
 * but here it is intentional and necessary for security.
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

/**
 * Returns `true` if the URL is safe to use in an `href` attribute.
 *
 * Safe means: no javascript/data/vbscript protocol, no control-character
 * smuggling, no empty URLs.
 */
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

/**
 * Returns a safe `href` value.  If the input URL passes {@link isSafeUrl},
 * it is returned unchanged (with control characters stripped).  Otherwise
 * `fallback` is returned (defaults to `'#'`).
 */
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
