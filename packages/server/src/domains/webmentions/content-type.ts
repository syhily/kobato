const HTML_MEDIA_TYPES = new Set(['text/html', 'application/xhtml+xml'])

export function isHtmlContentType(header: string | null | undefined): boolean {
  if (header === null || header === undefined) {
    return true
  }
  const mediaType = header.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  return mediaType === '' || HTML_MEDIA_TYPES.has(mediaType)
}
