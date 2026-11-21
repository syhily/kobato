export const CONTENT_IMAGE_PATH_REGEX = /(.*\/content\/images)\/(.*)/

export function parseUrlPathname(src: string): string {
  try {
    return new URL(src).pathname
  } catch {
    return src
  }
}

export function getImageFilenameFromSrc(src: string): string {
  return /\/([^/]*)$/.exec(parseUrlPathname(src))?.[1] ?? ''
}

export const isLocalContentImage = function (url: string, siteUrl = '', imageBaseUrl = '') {
  const normalizedSiteUrl = siteUrl.replace(/\/$/, '')
  const imagePath = url.replace(normalizedSiteUrl, '')
  if (/^(\/.*|__INKLING_URL__)\/?content\/images\//.test(imagePath)) {
    return true
  }

  if (!imageBaseUrl) {
    return false
  }
  const normalizedBaseUrl = imageBaseUrl.replace(/\/$/, '')
  return /^\/?content\/images\//.test(url.replace(normalizedBaseUrl, ''))
}
