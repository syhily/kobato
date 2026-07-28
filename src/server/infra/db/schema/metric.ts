import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'

// Per-entity metric counters keyed on `(type, owner_id)` where `type` is
// `'post' | 'page'` and `owner_id` references `post.id` / `page.id`.
// Counters move with single-row UPDATEs from the comment + like flows,
// so the table stays narrow on purpose. `public_id` is the opaque UUID
// exposed on the public API wire (the field still named `page_key` on
// the request/response envelope) so numeric ids never reach the browser.
// `(type, owner_id)` is the application-side join key; `public_id` is
// the wire-side identifier — both are unique.
export const metric = sqliteTable(
  'metric',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    // Populated by `ensureMetric(type, ownerId)` on every metric
    // upsert. `publicId` is the opaque UUID surfaced to public clients
    // in place of the historical URL-based `key`. `type` mirrors the
    // `content` table convention (`text`, no DB enum, see the `content`
    // discriminator comment block below) so future entity types extend
    // without a migration.
    type: text('type').$type<'post' | 'page'>().notNull(),
    ownerId: integer('owner_id').notNull(),
    publicId: text('public_id')
      .notNull()
      .$defaultFn(() => randomUUID()),
    voteUp: integer('vote_up'),
    voteDown: integer('vote_down'),
    pv: integer('pv'),
  },
  (table) => [
    uniqueIndex('uq_metric_public_id').on(table.publicId),
    uniqueIndex('uq_metric_owner').on(table.type, table.ownerId),
    index('idx_metric_deleted_at').on(table.deletedAt),
  ],
)

export const like = sqliteTable(
  'like',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    token: text('token'),
    type: text('type').$type<'post' | 'page'>().notNull(),
    ownerId: integer('owner_id').notNull(),
  },
  (table) => [index('idx_like_token').on(table.token), index('idx_like_owner').on(table.type, table.ownerId)],
)
