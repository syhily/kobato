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
}

const DEFAULT_SRCSET_BREAKPOINTS = [256, 512, 768, 1024, 1280, 1536]

export function getImageUrl({ src, width, height, quality, assetHost, urlTemplate }: ImageUrlOptions): string {
  if (!isTransformableRemoteImage(src, assetHost)) {
    return src
  }

  const template = (urlTemplate ?? '').trim()
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
  breakpoints,
}: ImageSrcsetOptions): string {
  if (!isTransformableRemoteImage(src, assetHost)) {
    return ''
  }

  const template = (urlTemplate ?? '').trim()
  if (template === '') {
    return ''
  }

  const bps = breakpoints ?? DEFAULT_SRCSET_BREAKPOINTS
  const maxWidth = Math.max(width * 2, 1536)
  const ratio = height / width

  return bps
    .filter((w) => w <= maxWidth)
    .map((w) => {
      const h = Math.round(w * ratio)
      const url = getImageUrl({ src, width: w, height: h, quality, assetHost, urlTemplate })
      return `${url} ${w}w`
    })
    .join(', ')
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
