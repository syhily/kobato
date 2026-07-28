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

export function ifNoneMatch(request: Request, etag: string): boolean {
  const header = request.headers.get('if-none-match')
  if (header === null) {
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
