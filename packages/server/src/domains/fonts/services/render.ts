import type { FontsSettings } from '@kobato/shared/config/types.ts'
import type { ResolvedFont, ResolvedFonts } from '@kobato/shared/types/fonts.ts'

import type { Database } from '../../../infra/db/database'

import { getLogger } from '../../../infra/logger'
import { resolveAssetUrl } from '../../../infra/storage/public-url'
import { findFontsByIds, resolveSlotOrder } from './read'

const log = getLogger('fonts.render')

const EMPTY: ResolvedFonts = { global: [], post: [], code: [] }

function etagToTimestamp(etag: string): number {
  // First 8 hex chars of the sha256 etag → stable `?v=` cache-buster; repackaging changes it.
  return parseInt(etag.slice(0, 8), 16)
}

/** Settings `fonts` → per-slot `{ family, href }` lists; stale ids drop silently. @param wantsPostFonts when false, `post`/`code` resolve to `[]` (routes opt in via `handle.postFonts`). */
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
        // Consume the persisted `cssKey` — `route`/`stripPrefix` must stay in sync with fonts-embedded.ts.
        href = resolveAssetUrl(row.cssKey, etagToTimestamp(row.etag), {
          route: '/fonts/embedded/',
          stripPrefix: 'fonts/',
        })
      } catch (error) {
        // Asset base URL unconfigured — drop this font rather than failing the render.
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
