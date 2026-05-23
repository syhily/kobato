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

// Shared revision repository for both pages and (eventually) posts.
//
// Why a single shared table instead of `page_revision` / `post_revision`?
// 1. PortableText body shape is identical between the two; splitting
//    forces two near-identical projections.
// 2. The editor save/publish state machine is also identical (draft
//    branches off the latest revision, publish promotes one row).
// 3. Cross-content features added later — e.g. "where is image X
//    embedded?" or "global trash bin" — are a single index scan on
//    `content` instead of a UNION of two history tables.
//
// Discriminator pair `(type, owner_id)`:
// - `type` is `'page' | 'post'` (no DB enum — keep it varchar so a
//   future `'note'` / `'snippet'` doesn't require a `pg_enum_add`
//   migration).
// - `owner_id` references `page.id` when type='page' and (in the
//   future) the corresponding `post.id`. The FK is **not** enforced
//   in DDL: a polymorphic FK isn't expressible without a CHECK +
//   trigger pair, and the application layer guarantees the invariant
//   inside transactions where it matters.
//
// Revision numbering:
// - `revision_no` is monotonically increasing **per (type, owner_id)**.
//   The unique index `uq_content_owner_revision` enforces no two
//   revisions of the same owner share a number; the service layer
//   acquires `SELECT … FOR UPDATE` on the page row before computing
//   `MAX(revision_no) + 1` so concurrent saves serialise correctly.
//
// Status:
// - `'draft'` is the in-progress revision the editor writes back to
//   on every autosave; `'published'` is immutable and exactly one row
//   per owner is referenced by `page.published_revision_id` at any
//   given time. The transition is one-way (publishing a draft flips
//   it to `'published'`; further edits create a new draft on top).
//
// Optimistic concurrency:
// - `client_revision_token` is a UUID rotated on every server-side
//   write. The editor sends the token it last received; the service
//   layer rejects writes whose token doesn't match the row's current
//   token, surfacing a "conflict, choose a side" diff in the UI.
//
// Snapshot fields:
// - `body` is the canonical PortableText (`PortableTextBlock[]`)
//   payload. Validated by `@/shared/pt/schema` at the API
//   perimeter so a malformed payload never lands.
// - `image_sources` is the array of S3 storagePath values referenced
//   by the body, denormalised so the SSR enhancer can resolve
//   thumbhashes in a single `WHERE storage_path IN (…)` lookup
//   without re-walking the body tree.
// - `headings` is the structured TOC array (`{depth, text, slug}[]`),
//   pre-computed at save time so SSR doesn't re-parse PortableText
//   to render the right-hand TOC widget.
// - `author_id` records who saved the revision (NULL only for the
//   migration script that backfills the initial publication).
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
      .notNull()
      .default(sql`'[]'::jsonb`),
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

// Search index for posts: plain text extracted from PortableText bodies,
// plus an optional OpenAI embedding for vector similarity search.
// Kept in a separate table so the main `post` table stays narrow.
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
