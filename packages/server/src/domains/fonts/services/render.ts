import type { ResolvedFont, ResolvedFonts } from '@kobato/assets/fonts.ts'
import type { Database } from '@kobato/db/database.ts'
import type { FontsSettings } from '@kobato/settings/types.ts'

import { findFontsByIds, resolveSlotOrder } from '@kobato/server/domains/fonts/services/read.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { resolveAssetUrl } from '@kobato/server/infra/storage/public-url.ts'

const log = getLogger('fonts.render')

const EMPTY: ResolvedFonts = { global: [], post: [], code: [] }

function etagToTimestamp(etag: string): number {
  // First 8 hex chars of the sha256 etag → stable `?v=` cache-buster; repackaging changes it.
  return parseInt(etag.slice(0, 8), 16)
}

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
