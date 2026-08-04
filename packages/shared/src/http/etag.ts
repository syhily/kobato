import { createHash } from 'node:crypto'

// Single owner of the weak-etag contract shared by the core SSR loaders
// (`@kobato/server/http/loaders/*`) and the public frontend's 304
// decisions (`apps/public/src/routes/public/*`). Both apps serve the same
// public URL surface, so the same weakEtag inputs and the same 304 shape
// keep browser cache behavior identical across the two deployments.
// Server-only use: `ifNoneMatch` / `notModifiedResponse` read and build
// web-platform `Request` / `Response` objects and are never imported by
// browser bundles.

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
