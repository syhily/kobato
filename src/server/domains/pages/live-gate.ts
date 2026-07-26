import type { SQL } from 'drizzle-orm'

import { liveContentWhere, type LiveContentOptions } from '@/server/domains/content/schemas/live-gate'
import { page as pageMetaTable } from '@/server/infra/db/schema/page'

/**
 * Page-table binding of the live gate. Binds the four meta columns once
 * and delegates to `liveContentWhere`, so call sites never hand-assemble
 * the column struct (and can't drift into their own copy of the gate).
 * See the warning on `isLive` in `content/schemas/live-gate.ts`.
 */
export function livePageWhere(options?: LiveContentOptions): SQL {
  return liveContentWhere(
    {
      deletedAt: pageMetaTable.deletedAt,
      published: pageMetaTable.published,
      publishedRevisionId: pageMetaTable.publishedRevisionId,
      publishedAt: pageMetaTable.publishedAt,
    },
    options,
  )
}
