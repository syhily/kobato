import { randomBytes } from 'node:crypto'

import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { DomainError } from '@/server/infra/http/errors'

// S3 object key generator. Generic keys are unique per upload (always
// insert); category/friend keys are state keys — re-upload with the same
// slug/host overwrites.

export type ImageKindSpec =
  | { kind: 'generic'; now: Date }
  | { kind: 'category'; slug: string }
  | { kind: 'friend'; host: string }

const SAFE_PATH_SEGMENT = /^[a-z0-9._-]+$/

type SafeSegmentKind = 'categorySlug' | 'friendHost'

/**
 * Whitelist guard for state-key path segments; rejects `/` (path
 * traversal) and any non-ASCII byte.
 */
function assertSafePathSegment(value: string, segment: SafeSegmentKind): string {
  if (!SAFE_PATH_SEGMENT.test(value)) {
    throw new DomainError('BAD_REQUEST', descriptorFor('images.error.unsafeSegment', { segment }), [
      {
        messageKey: 'images.error.illegalSegmentValue',
        params: { segment, value },
        fallbackMessage: `Invalid ${segment}: "${value}"`,
        path: [segment],
      },
    ])
  }
  return value
}

export function buildObjectKey(spec: ImageKindSpec): string {
  switch (spec.kind) {
    case 'generic': {
      const yyyy = spec.now.getUTCFullYear().toString().padStart(4, '0')
      const MM = String(spec.now.getUTCMonth() + 1).padStart(2, '0')
      const dd = String(spec.now.getUTCDate()).padStart(2, '0')
      const HH = String(spec.now.getUTCHours()).padStart(2, '0')
      const mm = String(spec.now.getUTCMinutes()).padStart(2, '0')
      const ss = String(spec.now.getUTCSeconds()).padStart(2, '0')
      // `% 100` of ms kept for name sortability; the random suffix kills
      // the 10ms-bucket collision — two same-window uploads used to share
      // one key, and the loser's put overwrote the winner's bytes while
      // the winner's row kept pointing at it.
      const nn = String(spec.now.getUTCMilliseconds() % 100).padStart(2, '0')
      return `images/${yyyy}/${MM}/${yyyy}${MM}${dd}${HH}${mm}${ss}${nn}-${randomBytes(4).toString('hex')}.jpg`
    }
    case 'category':
      return `images/categories/${assertSafePathSegment(spec.slug, 'categorySlug')}.jpg`
    case 'friend':
      return `images/links/${assertSafePathSegment(spec.host, 'friendHost')}.jpg`
  }
}

/**
 * Normalise a friend's homepage URL into a bare hostname for the S3 key
 * segment; throws `DomainError('BAD_REQUEST')` on invalid URLs.
 */
export function extractHostForFriendKey(homepage: string): string {
  let host: string
  try {
    host = new URL(homepage).hostname.toLowerCase()
  } catch {
    throw new DomainError('BAD_REQUEST', descriptorFor('images.error.invalidHomepageUrl'), [
      {
        messageKey: 'images.error.homepageUrlInvalid',
        fallbackMessage: 'The homepage URL is invalid',
        path: ['homepage'],
      },
    ])
  }
  if (host === '') {
    throw new DomainError('BAD_REQUEST', descriptorFor('images.error.invalidHomepageUrl'), [
      {
        messageKey: 'images.error.homepageUrlInvalid',
        fallbackMessage: 'The homepage URL is invalid',
        path: ['homepage'],
      },
    ])
  }
  return assertSafePathSegment(host, 'friendHost')
}
