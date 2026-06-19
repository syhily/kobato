import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  vector,
} from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import type { InklingDocument } from '@/shared/inkling/schema'

import { createEmptyInklingDocument, EMPTY_INKLING_DOCUMENT } from '@/shared/inkling/empty'

// Shared revision table for pages and posts. A single table avoids near-
// identical projections and lets cross-content queries scan one index.
//
// `(type, owner_id)` is a polymorphic discriminator without a DB FK (not
// expressible for polymorphic refs); the app enforces it in transactions.
// `revision_no` increases per owner; concurrent saves serialise via `FOR UPDATE`.
// `client_revision_token` is rotated on every write for optimistic concurrency.
export const content = pgTable(
  'content',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    type: varchar('type', { length: 16 }).notNull(),
    ownerId: bigint('owner_id', { mode: 'bigint' }).notNull(),
    revisionNo: integer('revision_no').notNull(),
    status: varchar('status', { length: 16 }).notNull().default('draft'),
    body: jsonb('body')
      .$type<InklingDocument>()
      .notNull()
      .default(sql.raw(`'${JSON.stringify(EMPTY_INKLING_DOCUMENT)}'::jsonb`))
      .$defaultFn(() => createEmptyInklingDocument()),
    imageSources: jsonb('image_sources')
      .notNull()
      .default(sql`'[]'::jsonb`),
    headings: jsonb('headings')
      .notNull()
      .default(sql`'[]'::jsonb`),
    authorId: bigint('author_id', { mode: 'bigint' }),
    clientRevisionToken: uuid('client_revision_token')
      .notNull()
      .$defaultFn(() => randomUUID()),
  },
  (table) => [
    uniqueIndex('uq_content_owner_revision').on(table.type, table.ownerId, table.revisionNo),
    index('idx_content_owner_status').on(table.type, table.ownerId, table.status),
    index('idx_content_status').on(table.status),
  ],
)

// Plain text + embedding kept separate so the main `post` table stays narrow.
export const postSearchIndex = pgTable(
  'post_search_index',
  {
    postId: bigint('post_id', { mode: 'bigint' }).primaryKey().notNull(),
    plainText: text('plain_text').notNull().default(''),
    embedding: vector('embedding', { dimensions: 1536 }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`)
      .$defaultFn(() => new Date()),
  },
  (table) => [index('idx_post_search_embedding').using('hnsw', table.embedding.op('vector_cosine_ops'))],
)
