/**
 * Single owner of the site-owned asset-URL path grammar; the forward and
 * inverse resolvers in `src/server/infra/storage/public-url.ts` both compose
 * this module so the route shapes cannot drift.
 */

export const STORAGE_ROUTE_PREFIX = '/storage/'
export const EMBEDDED_FONT_ROUTE_PREFIX = '/fonts/embedded/'

export type AssetUrlRoute = typeof STORAGE_ROUTE_PREFIX | typeof EMBEDDED_FONT_ROUTE_PREFIX

export interface ParsedAssetUrl {
  /** Storage key the URL maps to (`fonts/<hash>/<file>` on the embedded-font route). */
  key: string
  route: AssetUrlRoute
}

// Content-addressed font packages: the hash is a lowercase sha256 hex digest.
const EMBEDDED_FONT_HASH = /^[0-9a-f]{64}$/

/** Parse a URL PATH (no query string — strip it beforehand) against the site-owned grammar; `null` for anything else. */
export function parseAssetUrlPath(pathname: string): ParsedAssetUrl | null {
  if (pathname.startsWith(STORAGE_ROUTE_PREFIX)) {
    const key = pathname.slice(STORAGE_ROUTE_PREFIX.length)
    return key === '' ? null : { key, route: STORAGE_ROUTE_PREFIX }
  }
  if (pathname.startsWith(EMBEDDED_FONT_ROUTE_PREFIX)) {
    const rest = pathname.slice(EMBEDDED_FONT_ROUTE_PREFIX.length)
    const slashIdx = rest.indexOf('/')
    if (slashIdx === -1) {
      return null
    }
    const hash = rest.slice(0, slashIdx)
    const filename = rest.slice(slashIdx + 1)
    if (!EMBEDDED_FONT_HASH.test(hash)) {
      return null
    }
    // Reject empty filenames, dotfiles, and hidden segments (defence-in-depth
    // beside resolveLocalPath).
    if (filename === '') {
      return null
    }
    for (const segment of filename.split('/')) {
      if (segment === '' || segment.startsWith('.')) {
        return null
      }
    }
    return { key: `fonts/${hash}/${filename}`, route: EMBEDDED_FONT_ROUTE_PREFIX }
  }
  return null
}

/** Whether `url` sits exactly on `siteOrigin` (http(s) only; a trailing slash on `siteOrigin` is ignored). */
export function isOnSiteOrigin(url: URL, siteOrigin: string): boolean {
  return (
    (url.protocol === 'https:' || url.protocol === 'http:') &&
    `${url.protocol}//${url.host}` === (siteOrigin.endsWith('/') ? siteOrigin.slice(0, -1) : siteOrigin)
  )
}
