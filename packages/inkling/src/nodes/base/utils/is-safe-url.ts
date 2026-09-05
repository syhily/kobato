/**
 * Check whether a URL is safe to use as a navigation target (e.g. `href`,
 * button action). Only `http:`/`https:` schemes and scheme-less relative URLs
 * are allowed.
 *
 * Export-side half of the URL policy pair: the input-side table
 * (`isPasteableLinkUrl` in `@/plugins/behaviour/clipboard-protocol`) decides
 * which pasted text becomes a link and deliberately also accepts
 * mailto/tel/ftp. The divergence is pinned in
 * `test/unit/plugins/behaviour/clipboard-protocol.test.tsx`.
 */
export function isSafeUrl(url: string): boolean {
  if (typeof url !== 'string') {
    return false
  }

  const trimmed = url.trim()
  if (trimmed === '') {
    return false
  }

  // Browsers strip ASCII tab/LF/CR before scheme parsing; a URL containing
  // them can smuggle a dangerous scheme past the regex below.
  if (/[\x00-\x20]/.test(trimmed)) {
    return false
  }

  const schemeMatch = trimmed.match(/^([a-z][a-z0-9+.-]*):/i)
  if (!schemeMatch) {
    // No scheme -> treat as a relative URL
    return true
  }

  const scheme = schemeMatch[1].toLowerCase()
  return scheme === 'http' || scheme === 'https'
}

/**
 * Check whether a URL is safe to use as a media source (e.g. `img src`,
 * video/audio `src`, thumbnail). Allows `http:`, `https:`, `data:`, `blob:`
 * and scheme-less relative URLs.
 */
export function isSafeMediaUrl(url: string): boolean {
  if (typeof url !== 'string') {
    return false
  }

  const trimmed = url.trim()
  if (trimmed === '') {
    return false
  }

  // Browsers strip ASCII tab/LF/CR before scheme parsing; a URL containing
  // them can smuggle a dangerous scheme past the regex below.
  if (/[\x00-\x20]/.test(trimmed)) {
    return false
  }

  const schemeMatch = trimmed.match(/^([a-z][a-z0-9+.-]*):/i)
  if (!schemeMatch) {
    // No scheme -> treat as a relative URL
    return true
  }

  const scheme = schemeMatch[1].toLowerCase()
  return scheme === 'http' || scheme === 'https' || scheme === 'data' || scheme === 'blob'
}
