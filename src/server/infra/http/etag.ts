import { createHash } from 'node:crypto'

export function weakEtag(parts: ReadonlyArray<string | number | Date | null | undefined>): string {
  const hash = createHash('sha1')
    .update(
      parts
        .map((p) => {
          if (p === null || p === undefined) {
            return ''
          }
          if (p instanceof Date) {
            return p.toISOString()
          }
          return String(p)
        })
        .join(''),
    )
    .digest('hex')
    .slice(0, 16)
  return `W/"${hash}"`
}

// Shared by the slim probe and the full-path re-check so both yield the same ETag.
export function postEtag(id: string | number, publishedAt: Date | undefined): string {
  return weakEtag(['post', String(id), publishedAt])
}

// Shared by the slim probe and the full-path re-check (id + publishedRevisionId + publishedAt).
export function pageEtag(
  id: string | number,
  publishedRevisionId: string | number | null,
  publishedAt: Date | undefined,
): string {
  return weakEtag(['page', String(id), publishedRevisionId, publishedAt])
}

// The oRPC wire has no header channel, so the If-None-Match string arrives as an input field.
export function etagHeaderMatches(header: string | null | undefined, etag: string): boolean {
  if (header === null || header === undefined) {
    return false
  }
  return header
    .split(',')
    .map((s) => s.trim())
    .includes(etag)
}

export function notModifiedResponse(etag: string): Response {
  return new Response(null, { status: 304, headers: { ETag: etag, Vary: 'Cookie' } })
}
