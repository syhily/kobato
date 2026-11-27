import type { ResolvedFont, ResolvedFonts } from '@kobato/base/assets/fonts'
import type { Database } from '@kobato/db/sqlite/database'
import type { FontsSettings } from '@kobato/settings/types'

import { findFontsByIds, resolveSlotOrder } from '@kobato/server/domains/fonts/services/read'
import { getLogger } from '@kobato/server/infra/logger'
import { resolveAssetUrl } from '@kobato/server/infra/storage/public-url'

const log = getLogger('fonts.render')

const EMPTY: ResolvedFonts = { global: [], post: [], code: [] }

function etagToTimestamp(etag: string): number {
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
        href = resolveAssetUrl(row.cssKey, etagToTimestamp(row.etag), {
          route: '/fonts/embedded/',
          stripPrefix: 'fonts/',
        })
      } catch (error) {
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
