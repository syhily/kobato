/**
 * The content-image URL grammar — the one home of the `/content/images/`
 * shape (previously encoded twice: the recognition regexes here and the
 * decompose regex in srcset-attribute) and of safe URL parsing for image
 * sources. Safe parse everywhere: `new URL(src)` threw on relative or
 * `__INKLING_URL__` srcs, and `getImageFilenameFromSrc` was called from the
 * drop path on host-supplied data — a non-absolute src is path-shaped, not
 * an error.
 *
 * The input-side counterpart of `isLocalContentImage` is `isInternalUrl`
 * (`@/utils/isInternalUrl`), which labels at-link results as
 * internal/external — a different grammar (site hostname + subdir), kept
 * separate on purpose.
 */

/** The content-images URL shape, capturing the path up to and including `/content/images` and the filename after it. */
export const CONTENT_IMAGE_PATH_REGEX = /(.*\/content\/images)\/(.*)/

/**
 * The pathname of a URL or path-shaped src: absolute URLs parse; relative
 * and `__INKLING_URL__` srcs pass through as-is (their shape is already
 * path-like).
 */
export function parseUrlPathname(src: string): string {
  try {
    return new URL(src).pathname
  } catch {
    return src
  }
}

/** The filename tail of a URL or path-shaped src (`''` when there is none). Never throws. */
export function getImageFilenameFromSrc(src: string): string {
  return parseUrlPathname(src).match(/\/([^/]*)$/)?.[1] ?? ''
}

/**
 * Export-side half of the "own URL" pair: recognizes our own content images
 * in exported markup (behind the render context).
 */
export const isLocalContentImage = function (url: string, siteUrl = '', imageBaseUrl = '') {
  const normalizedSiteUrl = siteUrl.replace(/\/$/, '')
  const imagePath = url.replace(normalizedSiteUrl, '')
  if (/^(\/.*|__INKLING_URL__)\/?content\/images\//.test(imagePath)) {
    return true
  }

  // imageBaseUrl covers images served from a separate CDN host
  if (!imageBaseUrl) {
    return false
  }
  const normalizedBaseUrl = imageBaseUrl.replace(/\/$/, '')
  return /^\/?content\/images\//.test(url.replace(normalizedBaseUrl, ''))
}
