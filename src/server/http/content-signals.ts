import { ORPCError } from '@orpc/server'

import type { ContentRedirectSignal, ContentSignal } from '@/shared/contracts/content'

// Loader helpers signal 301/302/304/404 by throwing `Response`s, which oRPC cannot
// carry: 30x/304 map onto the signal union, 404 becomes NOT_FOUND, anything else propagates.
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
