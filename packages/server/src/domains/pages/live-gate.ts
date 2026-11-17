import type { SQL } from 'drizzle-orm'

import { page as pageMetaTable } from '../../infra/db/schema/page'
import { liveContentWhere, type LiveContentOptions } from '../content/schemas/live-gate'

/**
 * Page-table binding of the live gate — call sites must not hand-assemble the column struct.
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
