import type { BlogSettingsBundle } from '@kobato/shared/config/types'

import { isWebmentionReceiveEnabled } from '@kobato/shared/config/getters'
import { tryParseUrl } from '@kobato/shared/utils/safe-url'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { createMiddleware } from 'hono/factory'

/**
 * W3C Webmention endpoint discovery for the frontend's page responses —
 * the HTTP `Link` header twin of `<link rel="webmention">` in the root
 * document.
 *
 * Core appends this header on every SSR response it serves
 * (`middleware-pipeline.ts` → `webmentionLinkHeader`); under the
 * two-service topology the PAGES come from the frontend, so the header
 * must be added here instead. The switch + site URL are read from the
 * SAME source core uses: the settings bundle served by the Content API's
 * `layout` procedure (`/rpc/content/layout` — the root loader already
 * consumes it; the redacted bundle keeps `siteIdentity.website` intact).
 *
 * Lazy fetch with a 60 s TTL cache (module-level): only the first HTML
 * response within a window triggers a core round-trip. A failed fetch
 * caches a SHORT negative entry (5 s) so a core that comes up late is
 * picked up quickly; while it fails, pages are served WITHOUT the header
 * — silently, never 500'ing the page.
 *
 * The link construction mirrors core's `webmentionLinkHeader` exactly
 * (same shared predicates `isWebmentionReceiveEnabled` + `tryParseUrl`,
 * same `<origin>/webmention` shape) — pinned by the parity test
 * `apps/public/tests/unit/lib/http/webmention-link.test.ts`.
 */

/** Positive cache TTL for a fetched layout bundle. */
const LAYOUT_TTL_MS = 60_000
/** Negative cache TTL after a failed fetch (recover fast, do not hammer). */
const LAYOUT_FAILURE_TTL_MS = 5_000

export function buildWebmentionLinkHeader(bundle: BlogSettingsBundle | null): string | null {
  if (!isWebmentionReceiveEnabled(bundle)) {
    return null
  }
  const website = bundle?.siteIdentity?.website
  if (website === undefined || website === '') {
    return null
  }
  const site = tryParseUrl(website)
  if (site === null) {
    return null
  }
  return `<${site.origin}/webmention>; rel="webmention"`
}

interface LayoutCacheEntry {
  link: string | null
  expiresAt: number
}

export function createWebmentionLinkMiddleware(coreApiUrl: string | null) {
  const trimmed = coreApiUrl?.trim()
  const coreBase = trimmed !== undefined && trimmed !== '' ? trimmed.replace(/\/+$/, '') : null

  let cache: LayoutCacheEntry | null = null

  const getLink = async (): Promise<string | null> => {
    const now = Date.now()
    if (cache !== null && cache.expiresAt > now) {
      return cache.link
    }
    let link: string | null = null
    if (coreBase !== null) {
      try {
        const res = await fetch(`${coreBase}/rpc/content/layout`, { headers: { accept: 'application/json' } })
        if (res.ok) {
          // The RPC wire shape is the oRPC envelope `{ json: <data> }`
          // (see `packages/test-utils/tests/_helpers/rpc-call.ts`) — the
          // data payload lives under `json`, not at the top level.
          const body = unsafeCast<{ json?: { blogSettings?: BlogSettingsBundle | null } }>(await res.json())
          link = buildWebmentionLinkHeader(body.json?.blogSettings ?? null)
        }
      } catch {
        // Core unreachable — leave the header off; the negative cache
        // entry below keeps us from retrying on every page load.
      }
    }
    cache = {
      link,
      // A failed fetch (or an unconfigured core) must not pin the header
      // off for the full minute — a short negative TTL recovers quickly.
      expiresAt: now + (link !== null ? LAYOUT_TTL_MS : LAYOUT_FAILURE_TTL_MS),
    }
    return link
  }

  return createMiddleware(async (c, next) => {
    await next()
    // Page responses only: HTML carries the endpoint declaration. The
    // proxied URL endpoints (feeds, assets, …) are never HTML, and a
    // non-HTML response must not grow a Link header.
    const contentType = c.res.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html')) {
      return
    }
    // Never duplicate an existing declaration (defensive — no current
    // route sets one).
    if (c.res.headers.has('Link')) {
      return
    }
    const link = await getLink()
    if (link !== null) {
      c.res.headers.append('Link', link)
    }
  })
}
