import { isOnSiteOrigin, parseAssetUrlPath, STORAGE_ROUTE_PREFIX } from '@kobato/base/assets/asset-url'

export type AdminImageKind = 'generic' | 'category' | 'friend'

export interface ResolvedImageMeta {
  thumbhash?: string
  width?: number
  height?: number
}

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

export function isSafeImageSegment(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed === '') {
    return false
  }
  return SAFE_PATH_SEGMENT.test(trimmed)
}

export function friendPosterStoragePath(homepage: string): string | null {
  const host = extractFriendHostSafe(homepage)
  return host === null ? null : `images/links/${host}.jpg`
}

export function friendPosterStoragePathFromUrl(poster: string): string | null {
  const trimmed = poster.trim()
  let pathname: string
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    const suffixIndex = trimmed.search(/[?#]/)
    pathname = suffixIndex === -1 ? trimmed : trimmed.slice(0, suffixIndex)
  } else {
    try {
      const url = new URL(trimmed)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return null
      }
      pathname = url.pathname
    } catch {
      return null
    }
  }
  const parsed = parseAssetUrlPath(pathname)
  if (parsed?.route !== STORAGE_ROUTE_PREFIX || !/^images\/links\/[a-z0-9._-]+\.jpg$/.test(parsed.key)) {
    return null
  }
  return parsed.key
}

export function retargetFriendPosterUrl(poster: string, homepage: string): string | null {
  if (friendPosterStoragePathFromUrl(poster) === null) {
    return null
  }
  const target = friendPosterStoragePath(homepage)
  if (target === null) {
    return null
  }
  const trimmed = poster.trim()
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    const suffixIndex = trimmed.search(/[?#]/)
    const suffix = suffixIndex === -1 ? '' : trimmed.slice(suffixIndex)
    return `${STORAGE_ROUTE_PREFIX}${target}${suffix}`
  }
  const url = new URL(trimmed)
  url.pathname = `${STORAGE_ROUTE_PREFIX}${target}`
  return url.toString()
}

export interface ImageUrlOptions {
  src: string
  width: number
  height: number
  quality?: number
  assetHost: string
  urlTemplate?: string
  siteOrigin?: string
}

const DEFAULT_SRCSET_BREAKPOINTS = [256, 512, 768, 1024, 1280, 1536]

export function siteOwnedStorageSrc(src: string, siteOrigin: string | undefined): string | null {
  if (src.startsWith(STORAGE_ROUTE_PREFIX)) {
    return src
  }
  if (siteOrigin === undefined || siteOrigin === '') {
    return null
  }
  try {
    const url = new URL(src)
    if (isOnSiteOrigin(url, siteOrigin)) {
      return url.pathname.startsWith(STORAGE_ROUTE_PREFIX) ? src : null
    }
  } catch {}
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
