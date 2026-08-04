import { post } from '@kobato/server/infra/db/schema/post'
import { tag } from '@kobato/server/infra/db/schema/taxonomy'
import { index, integer, primaryKey, sqliteTable } from 'drizzle-orm/sqlite-core'

export const postTag = sqliteTable(
  'post_tag',
  {
    postId: integer('post_id')
      .notNull()
      .references(() => post.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tag.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.postId, table.tagId] }), index('idx_post_tag_tag_id').on(table.tagId)],
)
