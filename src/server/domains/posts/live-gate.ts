import type { SQL } from 'drizzle-orm'

import {
  liveContentWhere,
  promotedContentWhere,
  type LiveContentOptions,
} from '@/server/domains/content/schemas/live-gate'
import { post as postMetaTable } from '@/server/infra/db/schema/post'

/**
 * Post-table binding of the live gate. Binds the four meta columns once
 * and delegates to `liveContentWhere`, so call sites never hand-assemble
 * the column struct (and can't drift into their own copy of the gate).
 * See the warning on `isLive` in `content/schemas/live-gate.ts`.
 */
export function livePostWhere(options?: LiveContentOptions): SQL {
  return liveContentWhere(
    {
      deletedAt: postMetaTable.deletedAt,
      published: postMetaTable.published,
      publishedRevisionId: postMetaTable.publishedRevisionId,
      publishedAt: postMetaTable.publishedAt,
    },
    options,
  )
}

/**
 * Post-table binding of the promoted gate. Binds the two meta columns
 * once and delegates to `promotedContentWhere`, so call sites never
 * hand-assemble the column struct (and can't drift into their own copy
 * of the gate). See the warning on `isPromoted` in `content/schemas/live-gate.ts`.
 */
export function promotedPostWhere(): SQL {
  return promotedContentWhere({
    published: postMetaTable.published,
    publishedRevisionId: postMetaTable.publishedRevisionId,
  })
}
