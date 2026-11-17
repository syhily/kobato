// Media-type gate for the documents this domain parses as HTML. The
// webmention receive + discovery fetches must never hand a binary or
// plain-text body to the HTML scanners — a hostile server can otherwise
// make every byte of its payload count as markup.

const HTML_MEDIA_TYPES = new Set(['text/html', 'application/xhtml+xml'])

/** `true` when a response body may be parsed as an HTML document: one of
 *  the two HTML media types, parameters (charset…) ignored. A MISSING or
 *  empty header is accepted — some static servers omit it — but any other
 *  declared type is not HTML. */
export function isHtmlContentType(header: string | null | undefined): boolean {
  if (header === null || header === undefined) {
    return true
  }
  const mediaType = header.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  return mediaType === '' || HTML_MEDIA_TYPES.has(mediaType)
}
