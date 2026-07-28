import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'

// Shared revision table for pages and posts. A single table avoids near-
// identical projections and lets cross-content queries scan one index.
//
// `(type, owner_id)` is a polymorphic discriminator without a DB FK (not
// expressible for polymorphic refs); the app enforces it in transactions.
// `revision_no` increases per owner; concurrent saves serialise on the
// single-writer connection. `client_revision_token` is rotated on every
// write for optimistic concurrency.
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
    body: text('body', { mode: 'json' })
      .notNull()
      .$defaultFn(() => []),
    imageSources: text('image_sources', { mode: 'json' })
      .notNull()
      .$defaultFn(() => []),
    headings: text('headings', { mode: 'json' })
      .notNull()
      .$defaultFn(() => []),
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

// Plain text kept separate so the main `post` table stays narrow. LIKE
// search joins this table for the body corpus (vector search removed).
export const postSearchIndex = sqliteTable('post_search_index', {
  postId: integer('post_id').primaryKey().notNull(),
  plainText: text('plain_text').notNull().default(''),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
})
