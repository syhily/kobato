import { sql } from 'drizzle-orm'
import { bigint, bigserial, index, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

// Per-entity metric counters keyed on `(type, owner_id)` where `type` is
// `'post' | 'page'` and `owner_id` references `post.id` / `page.id`.
// Counters move with single-row UPDATEs from the comment + like flows,
// so the table stays narrow on purpose. `public_id` is the opaque UUID
// exposed on the public API wire (the field still named `page_key` on
// the request/response envelope) so numeric ids never reach the browser.
// `(type, owner_id)` is the application-side join key; `public_id` is
// the wire-side identifier — both are unique.
export const metric = pgTable(
  'metric',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    // Populated by `ensureMetric(type, ownerId)` on every metric
    // upsert. `publicId` is the opaque UUID surfaced to public clients
    // in place of the historical URL-based `key`. `type` mirrors the
    // `content` table convention (`varchar(16)`, no DB enum, see the
    // `content` discriminator comment block below) so future entity
    // types extend without a `pg_enum_add` migration.
    type: varchar('type', { length: 16 }).$type<'post' | 'page'>().notNull(),
    ownerId: bigint('owner_id', { mode: 'bigint' }).notNull(),
    publicId: uuid('public_id')
      .notNull()
      .default(sql`gen_random_uuid()`)
      .$defaultFn(() => randomUUID()),
    voteUp: bigint('vote_up', { mode: 'number' }),
    voteDown: bigint('vote_down', { mode: 'number' }),
    pv: bigint('pv', { mode: 'number' }),
  },
  (table) => [
    uniqueIndex('uq_metric_public_id').on(table.publicId),
    uniqueIndex('uq_metric_owner').on(table.type, table.ownerId),
    index('idx_metric_deleted_at').on(table.deletedAt),
  ],
)

export const like = pgTable(
  'like',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).$defaultFn(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    token: varchar('token', { length: 255 }),
    type: varchar('type', { length: 16 }).$type<'post' | 'page'>().notNull(),
    ownerId: bigint('owner_id', { mode: 'bigint' }).notNull(),
  },
  (table) => [index('idx_like_token').on(table.token), index('idx_like_owner').on(table.type, table.ownerId)],
)
