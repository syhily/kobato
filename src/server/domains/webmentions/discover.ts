import type { SafeFetchFailure } from '@/server/infra/safe-fetch'

import { safeFetch } from '@/server/infra/safe-fetch'
import { isHttpUrl } from '@/shared/utils/safe-url'

// W3C §4.1 discovery: the Link response header wins over the HTML
// `<link>`/`<a rel="webmention">` fallback; regex-based, best-effort by
// design (size-capped document, no HTML parser).

const MAX_DISCOVERY_BYTES = 1024 * 1024 // mirrors fetchSourceHtml

// `<url>; rel="webmention"`, several per header line; rel may carry multiple tokens.
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
    // Discovery only insists on http(s) so it never stores an unusable endpoint; the real SSRF guard runs at POST time.
    return isHttpUrl(resolved) ? resolved : null
  } catch {
    return null
  }
}

/** Link header first, then the first HTML `<link>`/`<a>` listing webmention;
 *  relative endpoints resolve against the FINAL (post-redirect) URL. */
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

/** Sender-side rendering of a safe-fetch failure (reason + HTTP status). */
export function formatFetchFailure(result: SafeFetchFailure): string {
  const status = result.status === null ? '' : ` (HTTP ${result.status})`
  return `${result.reason}${status}`
}

/** Fetch the target and discover its endpoint (SSRF-guarded per hop); the
 *  UA comes from the caller. */
export async function discoverEndpoint(targetUrl: string, ua: string): Promise<DiscoveryResult> {
  const result = await safeFetch(targetUrl, {
    maxBytes: MAX_DISCOVERY_BYTES,
    headers: { 'User-Agent': ua, Accept: 'text/html, application/xhtml+xml' },
  })
  if (!result.ok) {
    return { kind: 'retry', error: formatFetchFailure(result) }
  }
  const html = new TextDecoder('utf-8').decode(result.body)
  const endpoint = parseWebmentionEndpoint(result.response.headers.get('link'), html, result.url)
  return endpoint === null ? { kind: 'none' } : { kind: 'found', endpoint }
}
