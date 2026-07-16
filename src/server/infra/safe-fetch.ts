import { isBlockedFetchHost, tryParseUrl } from '@/shared/utils/safe-url'

// One SSRF-guarded outbound-fetch module for every server-side download
// (plan 042). It owns the whole invariant that used to be triplicated in
// the music download, webmention source-fetch, and avatar mirror paths:
//
//   URL parse → http(s) protocol allowlist → `isBlockedFetchHost` →
//   `redirect: 'manual'` loop with per-hop revalidation and a redirect
//   budget → per-request timeout → size cap (Content-Length pre-check
//   plus buffered-body post-check).
//
// The module never logs and never throws domain errors: failures come back
// as a typed union and each caller maps them to its own error mode
// (music → DomainError variants, webmentions → DomainError variants,
// avatar → null with its privacy-safe warnings). If DNS-rebinding defense
// (resolve-then-check) ever lands, it lands HERE once.

export const SAFE_FETCH_DEFAULT_TIMEOUT_MS = 10_000
export const SAFE_FETCH_DEFAULT_MAX_REDIRECTS = 5

export interface SafeFetchOptions {
  /** Per-request timeout (each redirect hop gets a fresh budget). */
  timeoutMs?: number
  /** Byte cap enforced against both the Content-Length header (before the
   *  body is read) and the actual buffered body. Omit for no cap. */
  maxBytes?: number
  headers?: Record<string, string>
  /** Redirect budget. `0` rejects the first 3xx outright. */
  maxRedirects?: number
  /** Per-hop veto, evaluated after the SSRF guard but BEFORE the hop is
   *  fetched. Return `false` to stop with `redirect-vetoed`. Lets callers
   *  keep domain-specific redirect policy (the avatar default-avatar
   *  sentinel) without owning the loop. */
  shouldFollowRedirect?: (nextUrl: URL) => boolean
}

export type SafeFetchFailureReason =
  | 'invalid-url'
  | 'bad-protocol'
  | 'blocked-host'
  | 'too-many-redirects'
  | 'missing-redirect-location'
  | 'redirect-vetoed'
  | 'timeout'
  | 'too-large'
  | 'http-error'
  | 'fetch-failed'

export interface SafeFetchFailure {
  ok: false
  reason: SafeFetchFailureReason
  /** The URL that triggered the failure — the initial URL, the redirect
   *  target that was rejected, or the hop whose fetch failed. */
  url: string
  /** Upstream status; set only for `http-error`. */
  status: number | null
  /** The thrown error; set only for `fetch-failed` / `timeout`. */
  error: unknown
}

export interface SafeFetchSuccess {
  ok: true
  /** Final URL after any redirects. */
  url: string
  /** The final response. Its body has already been buffered into `body`,
   *  so read the bytes from there, not from the response. */
  response: Response
  /** Buffered body — already size-checked when `maxBytes` was given. */
  body: ArrayBuffer
}

export type SafeFetchResult = SafeFetchSuccess | SafeFetchFailure

function failure(
  reason: SafeFetchFailureReason,
  url: string,
  status: number | null = null,
  error: unknown = null,
): SafeFetchFailure {
  return { ok: false, reason, url, status, error }
}

function isTimeoutError(error: unknown): boolean {
  // `AbortSignal.timeout` rejects fetch with a DOMException named
  // 'TimeoutError' (undici). Everything else is a plain network failure.
  return error instanceof Error && error.name === 'TimeoutError'
}

/** Validate one fetch target (initial URL or redirect hop) against the
 *  protocol allowlist and the shared SSRF guard. */
function guardTarget(parsed: URL, url: string): SafeFetchFailure | null {
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return failure('bad-protocol', url)
  }
  if (isBlockedFetchHost(parsed.hostname)) {
    return failure('blocked-host', url)
  }
  return null
}

export async function safeFetch(url: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const {
    timeoutMs = SAFE_FETCH_DEFAULT_TIMEOUT_MS,
    maxBytes,
    headers,
    maxRedirects = SAFE_FETCH_DEFAULT_MAX_REDIRECTS,
    shouldFollowRedirect,
  } = options

  const initial = tryParseUrl(url)
  if (initial === null) {
    return failure('invalid-url', url)
  }
  const initialRejection = guardTarget(initial, url)
  if (initialRejection !== null) {
    return initialRejection
  }

  let currentUrl = url
  let response: Response
  for (let hop = 0; ; hop++) {
    try {
      response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers,
      })
    } catch (error) {
      return failure(isTimeoutError(error) ? 'timeout' : 'fetch-failed', currentUrl, null, error)
    }
    if (response.status < 300 || response.status >= 400) {
      break
    }
    if (hop >= maxRedirects) {
      return failure('too-many-redirects', currentUrl)
    }
    const location = response.headers.get('location')
    if (location === null) {
      return failure('missing-redirect-location', currentUrl)
    }
    let nextUrl: URL
    try {
      nextUrl = new URL(location, currentUrl)
    } catch {
      return failure('invalid-url', location)
    }
    // Re-validate every hop: a remote server can 302 toward an internal address.
    const hopRejection = guardTarget(nextUrl, nextUrl.toString())
    if (hopRejection !== null) {
      return hopRejection
    }
    if (shouldFollowRedirect !== undefined && !shouldFollowRedirect(nextUrl)) {
      return failure('redirect-vetoed', nextUrl.toString())
    }
    currentUrl = nextUrl.toString()
  }

  if (!response.ok) {
    return failure('http-error', currentUrl, response.status)
  }

  if (maxBytes !== undefined) {
    const length = response.headers.get('content-length')
    if (length !== null) {
      const expected = Number.parseInt(length, 10)
      if (Number.isFinite(expected) && expected > maxBytes) {
        return failure('too-large', currentUrl)
      }
    }
  }

  let body: ArrayBuffer
  try {
    body = await response.arrayBuffer()
  } catch (error) {
    return failure('fetch-failed', currentUrl, null, error)
  }
  if (maxBytes !== undefined && body.byteLength > maxBytes) {
    return failure('too-large', currentUrl)
  }
  return { ok: true, url: currentUrl, response, body }
}
