import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'

export const content = sqliteTable(
  'content',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    type: text('type').notNull(),
    ownerId: integer('owner_id').notNull(),
    revisionNo: integer('revision_no').notNull(),
    status: text('status').notNull().default('draft'),
    body: text('body', { mode: 'json' }).notNull(),
    imageSources: text('image_sources', { mode: 'json' })
      .notNull()
      .$defaultFn(() => []),
    headings: text('headings', { mode: 'json' })
      .notNull()
      .$defaultFn(() => []),
    bodyHtml: text('body_html'),
    bodyText: text('body_text'),
    bodyHtmlFeed: text('body_html_feed'),
    authorId: integer('author_id'),
    clientRevisionToken: text('client_revision_token')
      .notNull()
      .$defaultFn(() => randomUUID()),
  },
  (table) => [
    uniqueIndex('uq_content_owner_revision').on(table.type, table.ownerId, table.revisionNo),
    index('idx_content_owner_status').on(table.type, table.ownerId, table.status),
    index('idx_content_status').on(table.status),
  ],
)

export const postSearchIndex = sqliteTable('post_search_index', {
  postId: integer('post_id').primaryKey().notNull(),
  plainText: text('plain_text').notNull().default(''),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
})
