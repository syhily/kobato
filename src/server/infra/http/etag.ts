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

// The post-detail ETag builder. The slim probe and the full-path re-check
// both call it with the same inputs (id + publishedAt), so the two sites
// can never drift — repeat visits keep hitting the same 304.
export function postEtag(id: string | number, publishedAt: Date | undefined): string {
  return weakEtag(['post', String(id), publishedAt])
}

// The page-detail ETag builder, shared by the slim probe and the full-path
// re-check (id + publishedRevisionId + publishedAt — `updated` projects
// `meta.publishedAt`).
export function pageEtag(
  id: string | number,
  publishedRevisionId: string | number | null,
  publishedAt: Date | undefined,
): string {
  return weakEtag(['page', String(id), publishedRevisionId, publishedAt])
}

// Raw If-None-Match header value → match decision. The oRPC content
// procedures receive the header as an input field (the RPC wire has no
// header channel), so the check runs against the plain string here.
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
