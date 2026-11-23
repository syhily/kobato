import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const category = sqliteTable(
  'category',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    name: text('name').unique().notNull(),
    slug: text('slug').unique().notNull(),
    cover: text('cover').notNull(),
    og: text('og'),
    description: text('description').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [index('idx_category_sort_order').on(table.sortOrder)],
)

export const tag = sqliteTable('tag', {
  id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  name: text('name').unique().notNull(),
  slug: text('slug').unique().notNull(),
  ogImage: text('og_image').notNull().default(''),
})
