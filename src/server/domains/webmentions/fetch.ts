import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { isBlockedFetchHost, tryParseUrl } from '@/shared/utils/safe-url'

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

function assertFetchableSourceUrl(url: string): void {
  const parsed = tryParseUrl(url)
  if (parsed === null || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
    throw new DomainError('BAD_REQUEST', 'source URL is not a valid http(s) URL')
  }
  if (isBlockedFetchHost(parsed.hostname)) {
    throw new DomainError('BAD_REQUEST', 'source URL points at a blocked host')
  }
}

/**
 * Fetch the webmention source document. Every URL (initial and each
 * redirect hop) passes through the shared SSRF guard
 * (`isBlockedFetchHost` in `@/shared/utils/safe-url`) — the same guard
 * and per-hop revalidation pattern as the music download path. The
 * document is capped at {@link MAX_SOURCE_BYTES}; the cap is checked
 * against both the Content-Length header and the actual body.
 */
export async function fetchSourceHtml(sourceUrl: string): Promise<string> {
  assertFetchableSourceUrl(sourceUrl)
  let currentUrl = sourceUrl
  let response: Response
  for (let hop = 0; ; hop++) {
    try {
      response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(SOURCE_FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': WEBMENTION_UA, Accept: 'text/html, application/xhtml+xml' },
      })
    } catch (error) {
      log.warn('Webmention source fetch failed', { url: currentUrl, error })
      throw new DomainError('BAD_REQUEST', 'source could not be fetched (timeout or unreachable)')
    }
    if (response.status < 300 || response.status >= 400) {
      break
    }
    if (hop >= MAX_REDIRECTS) {
      throw new DomainError('BAD_REQUEST', 'source redirects too many times')
    }
    const location = response.headers.get('location')
    if (location === null) {
      throw new DomainError('BAD_REQUEST', 'source could not be fetched (invalid redirect)')
    }
    currentUrl = new URL(location, currentUrl).toString()
    // Re-validate every hop: a remote server can 302 toward an internal address.
    assertFetchableSourceUrl(currentUrl)
  }
  if (!response.ok) {
    throw new DomainError('BAD_REQUEST', `source could not be fetched (HTTP ${response.status})`)
  }

  const length = response.headers.get('content-length')
  if (length !== null) {
    const expected = Number.parseInt(length, 10)
    if (Number.isFinite(expected) && expected > MAX_SOURCE_BYTES) {
      throw new DomainError('BAD_REQUEST', 'source document exceeds the size limit')
    }
  }
  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > MAX_SOURCE_BYTES) {
    throw new DomainError('BAD_REQUEST', 'source document exceeds the size limit')
  }
  return new TextDecoder('utf-8').decode(buffer)
}
