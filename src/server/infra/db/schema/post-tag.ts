import { bigint, pgTable, primaryKey } from 'drizzle-orm/pg-core'

import { post } from '@/server/infra/db/schema/post'
import { tag } from '@/server/infra/db/schema/taxonomy'

export const postTag = pgTable(
  'post_tag',
  {
    postId: bigint('post_id', { mode: 'bigint' })
      .notNull()
      .references(() => post.id, { onDelete: 'cascade' }),
    tagId: bigint('tag_id', { mode: 'bigint' })
      .notNull()
      .references(() => tag.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.postId, table.tagId] })],
)
