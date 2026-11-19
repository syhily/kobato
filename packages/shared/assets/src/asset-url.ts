export const STORAGE_ROUTE_PREFIX = '/storage/'
export const EMBEDDED_FONT_ROUTE_PREFIX = '/fonts/embedded/'

export type AssetUrlRoute = typeof STORAGE_ROUTE_PREFIX | typeof EMBEDDED_FONT_ROUTE_PREFIX

export interface ParsedAssetUrl {
  /** Storage key the URL maps to (`fonts/<hash>/<file>` on the embedded-font route). */
  key: string
  route: AssetUrlRoute
}

const EMBEDDED_FONT_HASH = /^[0-9a-f]{64}$/

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

export function isOnSiteOrigin(url: URL, siteOrigin: string): boolean {
  return (
    (url.protocol === 'https:' || url.protocol === 'http:') &&
    `${url.protocol}//${url.host}` === (siteOrigin.endsWith('/') ? siteOrigin.slice(0, -1) : siteOrigin)
  )
}
