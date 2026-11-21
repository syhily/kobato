import type { SQL } from 'drizzle-orm'

import { post as postMetaTable } from '@kobato/db/schema/post'
import {
  liveContentWhere,
  promotedContentWhere,
  type LiveContentOptions,
} from '@kobato/server/domains/content/schemas/live-gate'

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

export function promotedPostWhere(): SQL {
  return promotedContentWhere({
    published: postMetaTable.published,
    publishedRevisionId: postMetaTable.publishedRevisionId,
  })
}
