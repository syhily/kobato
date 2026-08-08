import type { SafeFetchFailure } from '@/server/infra/safe-fetch'

import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { safeFetch } from '@/server/infra/safe-fetch'

const log = getLogger('webmentions.fetch')

// Inbox verification fetch budget: safe-fetch defaults plus a strict size
// cap that never weakens under retry.
export const MAX_SOURCE_BYTES = 1024 * 1024

// Identify the receiver honestly in the User-Agent.
const WEBMENTION_UA = 'Kobato Webmention Receiver (+https://yufan.me/webmention)'

// Maps safe-fetch failures onto the endpoint's 400 DomainErrors; transient
// failures carry retryable so the inbox queue re-arms instead of dropping.
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

/** Fetch the source document: SSRF-guarded per hop, capped at {@link MAX_SOURCE_BYTES}. */
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
