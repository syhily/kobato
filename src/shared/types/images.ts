// Wire-format DTOs for the admin image-management endpoints. Bigints
// are stringified, public projection is separate from row-level fields,
// and paginated list responses carry an explicit `total`.

export type AdminImageKind = 'generic' | 'category' | 'friend'

export interface AdminImageDto {
  id: string
  kind: AdminImageKind
  storagePath: string
  publicUrl: string
  mimeType: string
  width: number
  height: number
  byteSize: number
  thumbhash: string | null
  uploaderId: string | null
  /** Display name of the user who uploaded the image. */
  uploaderName: string | null
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface ListImagesInput {
  q?: string
  kind?: AdminImageKind | 'all'
  offset?: number
  limit?: number
}

export interface ListImagesOutput {
  images: AdminImageDto[]
  /** Total rows matching the filter (independent of `offset`/`limit`). */
  total: number
  hasMore: boolean
}

export interface UploadImageInput {
  kind: 'generic' | 'category' | 'friend'
  slug?: string
  host?: string
  note?: string
}

export interface UploadImageOutput {
  image: AdminImageDto
}

export interface DeleteImageInput {
  id: string
}

export interface DeleteImageOutput {
  success: true
}

export interface UpdateImageNoteInput {
  id: string
  note: string | null
}

export interface UpdateImageNoteOutput {
  image: AdminImageDto
}

export interface RecalculateThumbhashInput {
  id: string
}

export interface RecalculateThumbhashOutput {
  image: AdminImageDto
}

/** Pure client-friendly classifier so the table column doesn't have to import server code. */
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

/**
 * Isomorphic host extractor used by client-side cover dialogs to
 * preview the upload target before invoking the server. Mirrors
 * `extractHostForFriendKey` in `@/server/domains/images/key`.
 */
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

/**
 * Slug validator for category covers. Categories enforce a lowercase
 * ASCII slug pattern at the form layer, but the cover row still wants
 * to know whether the current value is safe to embed in an S3 key.
 */
export function isSafeImageSegment(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed === '') {
    return false
  }
  return SAFE_PATH_SEGMENT.test(trimmed)
}

/**
 * Compute the public-facing base URL the runtime uses to address an
 * uploaded image from the `assets` settings section. The server's
 * render-enhancer keeps an authoritative copy of this logic; this
 * isomorphic mirror is what the admin preview helpers rely on.
 */
export function buildPublicBaseUrlFromStorage(
  options:
    | {
        storageEnabled: boolean
        asset: { host: string; scheme: 'http' | 'https' }
      }
    | undefined,
): string | null {
  if (options === undefined) {
    return null
  }
  if (!options.storageEnabled) {
    return null
  }
  const trimmed = options.asset.host.replace(/\/$/, '')
  return trimmed === '' ? null : `${options.asset.scheme}://${trimmed}`
}

export interface ImageUrlOptions {
  src: string
  width: number
  height: number
  quality?: number
  assetHost: string
  /**
   * Transform template for remote images hosted on `assetHost`.
   *
   * Supported placeholders:
   *   - `{src}`     absolute source URL
   *   - `{width}`   requested width
   *   - `{height}`  requested height
   *   - `{quality}` jpeg/webp quality, defaults to 100
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

  // Re-append any query string at the end so cache-buster params don't
  // land in the middle of the URL (e.g. before a processing suffix).
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
