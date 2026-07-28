import type { Database } from '@/server/infra/db/database'
import type { FontsSettings } from '@/shared/config/types'
import type { ResolvedFont, ResolvedFonts } from '@/shared/types/fonts'

import { findFontsByIds, resolveSlotOrder } from '@/server/domains/fonts/services/read'
import { getLogger } from '@/server/infra/logger'
import { resolveAssetUrl } from '@/server/infra/storage/public-url'

const log = getLogger('fonts.render')

const EMPTY: ResolvedFonts = { global: [], post: [], code: [] }

function etagToTimestamp(etag: string): number {
  // The etag is a 64-char sha256 hex; take the first 8 hex chars as a stable
  // integer for the `?v=` cache-buster. Cheap + deterministic — a
  // repackaged font produces a new etag and therefore a new URL.
  return parseInt(etag.slice(0, 8), 16)
}

/**
 * Resolve the fonts referenced by a settings `fonts` payload into
 * browser-ready `{ family, href }` lists, one per slot. Batched in a single
 * query across all three slots. Stale UUIDs (a font GC'd but still in the
 * settings row) are dropped silently — a missing font degrades to the
 * fallback stack rather than crashing SSR.
 *
 * @param wantsPostFonts when false, `post` + `code` resolve to `[]` (they
 *   only load on routes that opt in via `handle.postFonts`).
 */
export async function resolveFontsForRender(
  db: Database,
  settings: FontsSettings,
  wantsPostFonts: boolean,
): Promise<ResolvedFonts> {
  const globalIds = settings.global
  const postIds = wantsPostFonts ? settings.post : []
  const codeIds = wantsPostFonts ? settings.code : []
  const allIds = [...globalIds, ...postIds, ...codeIds]
  if (allIds.length === 0) {
    return EMPTY
  }

  const byId = await findFontsByIds(db, allIds)
  if (byId.size === 0) {
    return EMPTY
  }

  const toResolved = (ids: readonly string[]): ResolvedFont[] =>
    resolveSlotOrder(ids, byId).map((row) => {
      let href: string
      try {
        // Consume the persisted `cssKey` (written by `fontCssKey(hash)` at
        // upload time) instead of recomputing the key layout from `hash`.
        // Local packages are served by the dedicated `/fonts/embedded/*`
        // route, not the generic `/storage/*` one — `route`/`stripPrefix`
        // below are that route's shape and must stay in sync with
        // src/server/http/resources/fonts-embedded.ts.
        href = resolveAssetUrl(row.storageDriver, row.cssKey, etagToTimestamp(row.etag), {
          local: { route: '/fonts/embedded/', stripPrefix: 'fonts/' },
        })
      } catch (error) {
        // Asset base URL unconfigured — degrade by dropping this font from
        // the stack rather than crashing the whole render.
        log.warn('Failed to resolve font URL', { id: row.id, error: String(error) })
        href = ''
      }
      return { family: row.familyName, href }
    })

  return {
    global: toResolved(globalIds),
    post: toResolved(postIds),
    code: toResolved(codeIds),
  }
}
