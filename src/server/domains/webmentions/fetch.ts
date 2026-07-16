import type { SafeFetchFailure } from '@/server/infra/safe-fetch'

import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { safeFetch } from '@/server/infra/safe-fetch'

const log = getLogger('webmentions.fetch')

// Slice decision (plan 026 Phase 0 #3): synchronous fetch-and-verify
// before 202, with a strict timeout and size cap. If spam volume ever
// makes the synchronous cost a problem, the fix is an async queue
// (Phase 2), not weaker caps.
export const SOURCE_FETCH_TIMEOUT_MS = 10_000
export const MAX_SOURCE_BYTES = 1024 * 1024 // 1 MB
const MAX_REDIRECTS = 5

// Identify the receiver honestly; some IndieWeb sites serve the
// microformats2 markup only to agents that look like webmention
// receivers, and a stock browser UA gets the same HTML either way.
const WEBMENTION_UA = 'Kobato Webmention Receiver (+https://yufan.me/webmention)'

// Map the safe-fetch failure union onto the receiver's DomainError
// variants; the HTTP layer turns these into the 400s the endpoint
// contract (and the resource tests) expects.
function sourceFetchError(result: SafeFetchFailure): DomainError {
  switch (result.reason) {
    case 'invalid-url':
    case 'bad-protocol':
      return new DomainError('BAD_REQUEST', 'source URL is not a valid http(s) URL')
    case 'blocked-host':
      return new DomainError('BAD_REQUEST', 'source URL points at a blocked host')
    case 'too-many-redirects':
      return new DomainError('BAD_REQUEST', 'source redirects too many times')
    case 'missing-redirect-location':
    case 'redirect-vetoed':
      return new DomainError('BAD_REQUEST', 'source could not be fetched (invalid redirect)')
    case 'timeout':
    case 'fetch-failed':
      log.warn('Webmention source fetch failed', { url: result.url, error: result.error })
      return new DomainError('BAD_REQUEST', 'source could not be fetched (timeout or unreachable)')
    case 'http-error':
      return new DomainError('BAD_REQUEST', `source could not be fetched (HTTP ${result.status})`)
    case 'too-large':
      return new DomainError('BAD_REQUEST', 'source document exceeds the size limit')
  }
}

/**
 * Fetch the webmention source document. Every URL (initial and each
 * redirect hop) passes through the shared SSRF guard owned by
 * `@/server/infra/safe-fetch` (`isBlockedFetchHost` in
 * `@/shared/utils/safe-url`, applied per hop with a redirect budget).
 * The document is capped at {@link MAX_SOURCE_BYTES}; the cap is checked
 * against both the Content-Length header and the actual body.
 */
export async function fetchSourceHtml(sourceUrl: string): Promise<string> {
  const result = await safeFetch(sourceUrl, {
    timeoutMs: SOURCE_FETCH_TIMEOUT_MS,
    maxBytes: MAX_SOURCE_BYTES,
    maxRedirects: MAX_REDIRECTS,
    headers: { 'User-Agent': WEBMENTION_UA, Accept: 'text/html, application/xhtml+xml' },
  })
  if (!result.ok) {
    throw sourceFetchError(result)
  }
  return new TextDecoder('utf-8').decode(result.body)
}
