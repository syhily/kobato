import type { SafeFetchFailure } from '@kobato/server/infra/safe-fetch'

import { DomainError } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import { safeFetch } from '@kobato/server/infra/safe-fetch'

const log = getLogger('webmentions.fetch')

// Fetch budget for the inbox worker's source verification, on the
// safe-fetch default timeout/redirect budget with a strict size cap.
// Transient failures (timeout / network / 5xx) are marked retryable so
// the queue retries them on a backoff waterline; everything else drops
// the queue row. The caps never weaken under retry.
export const MAX_SOURCE_BYTES = 1024 * 1024 // 1 MB

// Identify the receiver honestly; some IndieWeb sites serve the
// microformats2 markup only to agents that look like webmention
// receivers, and a stock browser UA gets the same HTML either way.
const WEBMENTION_UA = 'Kobato Webmention Receiver (+https://yufan.me/webmention)'

// Map the safe-fetch failure union onto the receiver's DomainError
// variants; the HTTP layer turns these into the 400s the endpoint
// contract (and the resource tests) expects. Transient infrastructure
// failures carry `retryable: true` — the inbox queue re-arms those rows
// instead of dropping them.
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
      return new DomainError('BAD_REQUEST', 'source could not be fetched (timeout or unreachable)', undefined, true)
    case 'http-error':
      return new DomainError(
        'BAD_REQUEST',
        `source could not be fetched (HTTP ${result.status})`,
        undefined,
        result.status !== null && result.status >= 500,
      )
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
    maxBytes: MAX_SOURCE_BYTES,
    headers: { 'User-Agent': WEBMENTION_UA, Accept: 'text/html, application/xhtml+xml' },
  })
  if (!result.ok) {
    throw sourceFetchError(result)
  }
  return new TextDecoder('utf-8').decode(result.body)
}
