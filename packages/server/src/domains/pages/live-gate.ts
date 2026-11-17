import type { SQL } from 'drizzle-orm'

import { page as pageMetaTable } from '@kobato/db/schema/page.ts'
import { liveContentWhere, type LiveContentOptions } from '@kobato/server/domains/content/schemas/live-gate.ts'

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
