import { safeFetch } from '@/server/infra/safe-fetch'
import { isHttpUrl } from '@/shared/utils/safe-url'

// Endpoint discovery (W3C Webmention §4.1): the Link response header wins
// over the HTML `<link>` / `<a rel="webmention">` fallback. Parsing is
// regex-based, the same documented trade-off as the receive side
// (`verify.ts`): the document is size-capped, so extraction is
// best-effort by design — no HTML parser dependency.

const DISCOVERY_TIMEOUT_MS = 10_000
const MAX_DISCOVERY_BYTES = 1024 * 1024 // 1 MB — mirrors fetchSourceHtml
const MAX_REDIRECTS = 5

// `<url>; rel="webmention"`, possibly several values in one header line.
// The rel attribute may carry several space-separated tokens
// (`rel="webmention pingback"`).
const LINK_HEADER_ENTRY_RE = /<([^>]*)>\s*;[^,]*?rel\s*=\s*"([^"]*)"/gi
// One `<link …>` or `<a …>` tag, then its rel / href attributes inside.
const LINK_OR_ANCHOR_TAG_RE = /<(?:link|a)\b[^>]*>/gi
const REL_ATTR_RE = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
const HREF_ATTR_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i

function relMentionsWebmention(rel: string): boolean {
  return rel.toLowerCase().split(/\s+/).includes('webmention')
}

function resolveEndpoint(href: string, finalUrl: string): string | null {
  try {
    const resolved = new URL(href, finalUrl).toString()
    // The real SSRF interception happens at POST time inside `safeFetch`
    // (protocol allowlist + blocklist + per-hop DNS); discovery only
    // insists on http(s) so it never stores an unusable value.
    return isHttpUrl(resolved) ? resolved : null
  } catch {
    return null
  }
}

/**
 * Pure extraction, split from the network shell for testing: Link header
 * first, then the first HTML `<link>`/`<a>` whose rel lists `webmention`.
 * Relative endpoints resolve against the FINAL (post-redirect) URL.
 */
export function parseWebmentionEndpoint(linkHeader: string | null, html: string, finalUrl: string): string | null {
  if (linkHeader !== null) {
    for (const match of linkHeader.matchAll(LINK_HEADER_ENTRY_RE)) {
      const [, href, rel] = match
      if (href !== undefined && rel !== undefined && relMentionsWebmention(rel)) {
        const endpoint = resolveEndpoint(href, finalUrl)
        if (endpoint !== null) {
          return endpoint
        }
      }
    }
  }
  for (const match of html.matchAll(LINK_OR_ANCHOR_TAG_RE)) {
    const tag = match[0]
    const relMatch = REL_ATTR_RE.exec(tag)
    const rel = relMatch?.[1] ?? relMatch?.[2] ?? relMatch?.[3]
    if (rel === undefined || !relMentionsWebmention(rel)) {
      continue
    }
    const hrefMatch = HREF_ATTR_RE.exec(tag)
    const href = hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3]
    if (href === undefined) {
      continue
    }
    const endpoint = resolveEndpoint(href, finalUrl)
    if (endpoint !== null) {
      return endpoint
    }
  }
  return null
}

export type DiscoveryResult =
  | { kind: 'found'; endpoint: string }
  /** The document was fetched but declares no endpoint — terminal. */
  | { kind: 'none' }
  /** The fetch itself failed (network, timeout, HTTP error, too large) — retryable. */
  | { kind: 'retry'; error: string }

/**
 * Fetch the target and discover its webmention endpoint. Every request
 * (initial and each redirect hop) goes through the shared SSRF guard in
 * `@/server/infra/safe-fetch`; fetch parameters mirror the receiver's
 * `fetchSourceHtml` exactly. The `ua` is supplied by the caller (the
 * worker composes it from the site's configured origin).
 */
export async function discoverEndpoint(targetUrl: string, ua: string): Promise<DiscoveryResult> {
  const result = await safeFetch(targetUrl, {
    timeoutMs: DISCOVERY_TIMEOUT_MS,
    maxBytes: MAX_DISCOVERY_BYTES,
    maxRedirects: MAX_REDIRECTS,
    headers: { 'User-Agent': ua, Accept: 'text/html, application/xhtml+xml' },
  })
  if (!result.ok) {
    const status = result.status === null ? '' : ` (HTTP ${result.status})`
    return { kind: 'retry', error: `${result.reason}${status}` }
  }
  const html = new TextDecoder('utf-8').decode(result.body)
  const endpoint = parseWebmentionEndpoint(result.response.headers.get('link'), html, result.url)
  return endpoint === null ? { kind: 'none' } : { kind: 'found', endpoint }
}
