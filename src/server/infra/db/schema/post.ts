import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { category } from '@/server/infra/db/schema/taxonomy'

export const post = sqliteTable(
  'post',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    slug: text('slug').unique().notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull().default(''),
    cover: text('cover').notNull().default(''),
    og: text('og'),
    published: integer('published', { mode: 'boolean' }).notNull().default(true),
    commentsEnabled: integer('comments_enabled', { mode: 'boolean' }).notNull().default(true),
    showToc: integer('show_toc', { mode: 'boolean' }).notNull().default(false),
    // Same semantics as `page.show_updated` — defaults false; flip on
    // displayed in the meta row.
    showUpdated: integer('show_updated', { mode: 'boolean' }).notNull().default(false),
    visible: integer('visible', { mode: 'boolean' }).notNull().default(true),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    publishedRevisionId: integer('published_revision_id'),
    /** The timestamp of the first publication. Immutable after set. */
    firstPublishedAt: integer('first_published_at', { mode: 'timestamp_ms' }),
    /** Author who created the post. NULL for legacy migrated posts. */
    authorId: integer('author_id'),
    // Post-specific taxonomy fields
    categoryId: integer('category_id').references(() => category.id, { onDelete: 'set null' }),
    alias: text('alias', { mode: 'json' })
      .notNull()
      .$defaultFn(() => []),
    /** When set, the post is pinned to the home feature area. */
    pinnedAt: integer('pinned_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    // `slug` already has a UNIQUE constraint (implicit unique index);
    // no need for a redundant non-unique index.
    index('idx_post_deleted_at').on(table.deletedAt),
    index('idx_post_category_id').on(table.categoryId),
    index('idx_post_published_at').on(table.publishedAt),
    index('idx_post_first_published_at').on(table.firstPublishedAt),
    index('idx_post_pinned_at').on(table.pinnedAt),
    index('idx_post_catalog').on(table.deletedAt, table.published, table.firstPublishedAt),
    index('idx_post_author_id').on(table.authorId),
  ],
)

export type PostMetaRow = typeof post.$inferSelect
export type NewPostMeta = typeof post.$inferInsert
