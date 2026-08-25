export type AdminImageKind = 'generic' | 'category' | 'friend'

export interface ListImagesInput {
  q?: string
  kind?: AdminImageKind | 'all'
  offset?: number
  limit?: number
}

/**
 * Sparse image metadata resolved for a PT image source (dimensions +
 * thumbhash; the block keeps its own src). Produced by the images
 * domain enhancer, consumed by the PT renderer's image-meta context.
 */
export interface ResolvedImageMeta {
  thumbhash?: string
  width?: number
  height?: number
}

/** Client-friendly classifier so the table column doesn't have to import server code. */
export function classifyImageKind(storagePath: string): AdminImageKind {
  if (storagePath.startsWith('images/categories/')) {
    return 'category'
  }
  if (storagePath.startsWith('images/links/')) {
    return 'friend'
  }
  return 'generic'
}

const SAFE_PATH_SEGMENT = /^[a-z0-9._-]+$/

/** Isomorphic host extractor for client-side cover dialogs; must mirror `extractHostForFriendKey` in `@/server/domains/images/key`. */
export function extractFriendHostSafe(homepage: string): string | null {
  const trimmed = homepage.trim()
  if (trimmed === '') {
    return null
  }
  let host: string
  try {
    host = new URL(trimmed).hostname.toLowerCase()
  } catch {
    return null
  }
  if (host === '' || !SAFE_PATH_SEGMENT.test(host)) {
    return null
  }
  return host
}

/** Whether the value is safe to embed in an S3 key (categories enforce the lowercase ASCII pattern at the form layer). */
export function isSafeImageSegment(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed === '') {
    return false
  }
  return SAFE_PATH_SEGMENT.test(trimmed)
}

export interface ImageUrlOptions {
  src: string
  width: number
  height: number
  quality?: number
  assetHost: string
  /**
   * Transform template for remote images on `assetHost`.
   * Placeholders: `{src}`, `{width}`, `{height}`, `{quality}` (defaults to 100).
   */
  urlTemplate?: string
  /**
   * Site origin (e.g. `https://example.com`). When set and `src` is a
   * site-owned `/storage/<key>` URL, the template is NOT applied inline — the
   * transform intent travels as `?w=&h=&q=` query params and the `/storage/*`
   * 302 boundary substitutes it into the template server-side. The server-side
   * twin of the `{src}/{width}/{height}/{quality}` substitution below is
   * `buildRedirectLocation` in `src/server/http/resources/storage-redirect.ts`
   * — keep the two semantics in sync.
   */
  siteOrigin?: string
}

const DEFAULT_SRCSET_BREAKPOINTS = [256, 512, 768, 1024, 1280, 1536]

/** Path prefix of site-owned asset URLs served (and 302'd) by the origin itself. */
const STORAGE_ROUTE_PREFIX = '/storage/'

/**
 * The src unchanged when it is a site-owned asset URL in either accepted
 * form — origin-relative (`/storage/<key>`) or absolute on the site origin —
 * otherwise `null` (external URLs keep the legacy inline-template path).
 */
export function siteOwnedStorageSrc(src: string, siteOrigin: string | undefined): string | null {
  if (src.startsWith(STORAGE_ROUTE_PREFIX)) {
    return src
  }
  if (siteOrigin === undefined || siteOrigin === '') {
    return null
  }
  try {
    const url = new URL(src)
    if (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      `${url.protocol}//${url.host}` === siteOrigin.replace(/\/$/, '')
    ) {
      return url.pathname.startsWith(STORAGE_ROUTE_PREFIX) ? src : null
    }
  } catch {
    // Not a URL (data:, malformed) — not site-owned storage.
  }
  return null
}

function appendTransformParams(src: string, width: number, height: number, quality: number | undefined): string {
  const params = new URLSearchParams({ w: String(width), h: String(height) })
  if (quality !== undefined) {
    params.set('q', String(quality))
  }
  const sep = src.includes('?') ? '&' : '?'
  return `${src}${sep}${params.toString()}`
}

interface RenderedSrcsetEntry {
  url: string
  width: number
}

function renderSrcset(
  options: Pick<ImageUrlOptions, 'width' | 'height'>,
  breakpoints: number[] | undefined,
  renderUrl: (width: number, height: number) => string,
): string {
  const bps = breakpoints ?? DEFAULT_SRCSET_BREAKPOINTS
  const maxWidth = Math.max(options.width * 2, 1536)
  const ratio = options.height / options.width

  const entries: RenderedSrcsetEntry[] = []
  for (const w of bps) {
    if (w <= maxWidth) {
      entries.push({ url: renderUrl(w, Math.round(w * ratio)), width: w })
    }
  }
  return entries.map(({ url, width }) => `${url} ${width}w`).join(', ')
}

export function getImageUrl({
  src,
  width,
  height,
  quality,
  assetHost,
  urlTemplate,
  siteOrigin,
}: ImageUrlOptions): string {
  const template = (urlTemplate ?? '').trim()
  if (siteOwnedStorageSrc(src, siteOrigin) !== null) {
    // Site-owned asset: signal transform intent as query params; the
    // `/storage/*` redirect substitutes them into the template. Without a
    // template there is nothing to signal — serve the plain URL.
    return template === '' ? src : appendTransformParams(src, width, height, quality)
  }

  if (!isTransformableRemoteImage(src, assetHost)) {
    return src
  }
  if (template === '') {
    return src
  }

  const imageQuality = typeof quality === 'number' ? quality : 100
  const rendered = template
    .replaceAll('{width}', String(width))
    .replaceAll('{height}', String(height))
    .replaceAll('{quality}', String(imageQuality))

  // Re-append the query string so cache-buster params don't land mid-URL.
  const qIndex = src.indexOf('?')
  const srcPath = qIndex >= 0 ? src.slice(0, qIndex) : src
  const search = qIndex >= 0 ? src.slice(qIndex) : ''

  let url: string
  if (rendered.includes('{src}')) {
    url = rendered.replaceAll('{src}', srcPath)
  } else {
    url = `${srcPath}${rendered}`
  }

  if (search === '') {
    return url
  }
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}${search.slice(1)}`
}

export interface ImageSrcsetOptions extends ImageUrlOptions {
  breakpoints?: number[]
}

export function getImageSrcset({
  src,
  width,
  height,
  quality,
  assetHost,
  urlTemplate,
  siteOrigin,
  breakpoints,
}: ImageSrcsetOptions): string {
  const template = (urlTemplate ?? '').trim()
  if (siteOwnedStorageSrc(src, siteOrigin) !== null) {
    if (template === '') {
      return ''
    }
    return renderSrcset({ width, height }, breakpoints, (w, h) => appendTransformParams(src, w, h, quality))
  }

  if (!isTransformableRemoteImage(src, assetHost)) {
    return ''
  }
  if (template === '') {
    return ''
  }

  return renderSrcset({ width, height }, breakpoints, (w, h) =>
    getImageUrl({ src, width: w, height: h, quality, assetHost, urlTemplate }),
  )
}

export function isTransformableRemoteImage(src: string, assetHost: string): boolean {
  if (src.startsWith('data:')) {
    return false
  }

  try {
    const url = new URL(src)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname === assetHost
  } catch {
    return false
  }
}
