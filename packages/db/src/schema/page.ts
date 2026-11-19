import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const page = sqliteTable(
  'page',
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
    webmentionsEnabled: integer('webmentions_enabled', { mode: 'boolean' }).notNull().default(true),
    showToc: integer('show_toc', { mode: 'boolean' }).notNull().default(false),
    showUpdated: integer('show_updated', { mode: 'boolean' }).notNull().default(false),
    showFriends: integer('show_friends', { mode: 'boolean' }).notNull().default(false),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    publishedRevisionId: integer('published_revision_id'),
    firstPublishedAt: integer('first_published_at', { mode: 'timestamp_ms' }),
    contentLanguage: text('content_language'),
    authorId: integer('author_id'),
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
