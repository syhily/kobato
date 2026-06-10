import { sql } from 'drizzle-orm'
import { bigint, bigserial, boolean, index, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'

export const post = pgTable(
  'post',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    slug: varchar('slug', { length: 80 }).unique().notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    summary: text('summary').notNull().default(''),
    cover: text('cover').notNull().default(''),
    og: text('og'),
    published: boolean('published').notNull().default(true),
    commentsEnabled: boolean('comments_enabled').notNull().default(true),
    showToc: boolean('show_toc').notNull().default(false),
    // Same semantics as `page.show_updated` — defaults false; flip on
    // displayed in the meta row.
    showUpdated: boolean('show_updated').notNull().default(false),
    visible: boolean('visible').notNull().default(true),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    publishedRevisionId: bigint('published_revision_id', { mode: 'bigint' }),
    /** The timestamp of the first publication. Immutable after set. */
    firstPublishedAt: timestamp('first_published_at', { withTimezone: true, mode: 'date' }),
    /** Author who created the post. NULL for legacy migrated posts. */
    authorId: bigint('author_id', { mode: 'bigint' }),
    // Post-specific taxonomy fields
    category: varchar('category', { length: 20 }).notNull().default(''),
    alias: jsonb('alias')
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** When set, the post is pinned to the home feature area. */
    pinnedAt: timestamp('pinned_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    // `slug` already has a UNIQUE constraint (implicit unique index);
    // no need for a redundant non-unique index.
    index('idx_post_deleted_at').on(table.deletedAt),
    index('idx_post_category').on(table.category),
    index('idx_post_published_at').on(table.publishedAt),
    index('idx_post_first_published_at').on(table.firstPublishedAt),
    index('idx_post_pinned_at').on(table.pinnedAt),
    index('idx_post_catalog').on(table.deletedAt, table.published, table.firstPublishedAt),
  ],
)

export type PostMetaRow = typeof post.$inferSelect
export type NewPostMeta = typeof post.$inferInsert
