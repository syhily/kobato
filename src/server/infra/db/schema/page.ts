import { bigint, bigserial, boolean, index, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'

// Page metadata table. The PT body lives in `content`; `page` only
// points to the published revision. Slugs share a global namespace with
// posts; cross-table collisions are caught at the app layer.
export const page = pgTable(
  'page',
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
    showUpdated: boolean('show_updated').notNull().default(false),
    showFriends: boolean('show_friends').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    publishedRevisionId: bigint('published_revision_id', { mode: 'bigint' }),
    /** The timestamp of the first publication. Immutable after set. */
    firstPublishedAt: timestamp('first_published_at', { withTimezone: true, mode: 'date' }),
    /** Author who created the page. NULL for legacy migrated pages. */
    authorId: bigint('author_id', { mode: 'bigint' }),
  },
  (table) => [
    index('idx_page_deleted_at').on(table.deletedAt),
    index('idx_page_first_published_at').on(table.firstPublishedAt),
    index('idx_page_catalog').on(table.deletedAt, table.published, table.firstPublishedAt),
    index('idx_page_author_id').on(table.authorId),
  ],
)

export type PageMetaRow = typeof page.$inferSelect
export type NewPageMeta = typeof page.$inferInsert
