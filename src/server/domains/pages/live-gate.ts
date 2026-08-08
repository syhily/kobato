import type { SQL } from 'drizzle-orm'

import { liveContentWhere, type LiveContentOptions } from '@/server/domains/content/schemas/live-gate'
import { page as pageMetaTable } from '@/server/infra/db/schema/page'

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
