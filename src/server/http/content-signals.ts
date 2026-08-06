import { ORPCError } from '@orpc/server'

import type { ContentRedirectSignal, ContentSignal } from '@/shared/contracts/content'

// The shared loader helpers (`listingLoader`, `searchLoader`,
// `loadPagePreview`) still signal 301/302/304/404 by throwing
// `Response`s — the exact behaviour the public URL contract pins.
// oRPC procedures can't throw Responses across the wire, so the
// content controllers translate: 30x/304 become the discriminated
// union the route loaders translate back into Responses, 404 becomes
// `ORPCError('NOT_FOUND')` (the loader re-throws `notFound()`), and
// anything else propagates untouched. The `allowed` overload narrows
// the returned union to the signals a procedure can actually produce
// (listings never answer 304 — they carry no ETag).
export function translateThrownResponse(error: unknown, allowed: 'redirect-only'): ContentRedirectSignal
export function translateThrownResponse(error: unknown): ContentSignal
export function translateThrownResponse(error: unknown): ContentSignal {
  if (error instanceof Response) {
    if (error.status === 304) {
      const etag = error.headers.get('ETag')
      if (etag !== null) {
        return { kind: 'not-modified', etag }
      }
    }
    if (error.status === 301 || error.status === 302) {
      const to = error.headers.get('Location')
      if (to !== null) {
        return { kind: 'redirect', to, status: error.status }
      }
    }
    if (error.status === 404) {
      throw new ORPCError('NOT_FOUND', { message: 'Not Found' })
    }
  }
  throw error
}
