/**
 * The content-image URL grammar — the one home of the `/content/images/`
 * shape (shared by the recognition regex here and the srcset decompose path)
 * and of safe URL parsing for image sources. Parsing never throws: a
 * non-absolute src (relative or `__INKLING_URL__`) is path-shaped, not an
 * error, so drop-path callers can hand it host-supplied data.
 *
 * The input-side counterpart of `isLocalContentImage` is `isInternalUrl`
 * (`@/inkling/utils/isInternalUrl`), which labels at-link results as
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
  return /\/([^/]*)$/.exec(parseUrlPathname(src))?.[1] ?? ''
}

/**
 * Export-side half of the "own URL" pair: recognizes the site's own content images
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
