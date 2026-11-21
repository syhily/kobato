import type { SafeFetchFailure } from '@kobato/server/infra/safe-fetch'

import { isHtmlContentType } from '@kobato/server/domains/webmentions/content-type'
import { DomainError } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import { safeFetch } from '@kobato/server/infra/safe-fetch'

const log = getLogger('webmentions.fetch')

export const MAX_SOURCE_BYTES = 1024 * 1024

const WEBMENTION_UA = 'Kobato Webmention Receiver (+https://yufan.me/webmention)'

function sourceFetchError(result: SafeFetchFailure): DomainError {
  switch (result.reason) {
    case 'invalid-url':
    case 'bad-protocol':
      return new DomainError('BAD_REQUEST', 'source URL is not a valid http(s) URL')
    case 'bad-port':
      return new DomainError('BAD_REQUEST', 'source URL targets a non-standard port')
    case 'blocked-host':
      return new DomainError('BAD_REQUEST', 'source URL points at a blocked host')
    case 'too-many-redirects':
      return new DomainError('BAD_REQUEST', 'source redirects too many times')
    case 'missing-redirect-location':
    case 'redirect-vetoed':
      return new DomainError('BAD_REQUEST', 'source could not be fetched (invalid redirect)')
    case 'dns-failure':
      log.warn('Webmention source DNS resolution failed', { url: result.url, error: result.error })
      return new DomainError('BAD_REQUEST', 'source could not be fetched (DNS resolution failed)', undefined, true)
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

export async function fetchSourceHtml(sourceUrl: string): Promise<string> {
  const result = await safeFetch(sourceUrl, {
    maxBytes: MAX_SOURCE_BYTES,
    headers: { 'User-Agent': WEBMENTION_UA, Accept: 'text/html, application/xhtml+xml' },
    operation: 'webmentions.source',
  })
  if (!result.ok) {
    throw sourceFetchError(result)
  }
  if (!isHtmlContentType(result.response.headers.get('content-type'))) {
    throw new DomainError('BAD_REQUEST', 'source document is not HTML')
  }
  return new TextDecoder('utf-8').decode(result.body)
}
