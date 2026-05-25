import { bigserial, index, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'

// Post category. CRUD at `/admin/taxonomy/categories`. MDX references categories by
// `name` (`UNIQUE`). `slug` drives `/cats/:slug` (`UNIQUE`). `sort_order`
// orders `/categories`.
//
// Counters (`counts` on the public DTO) stay derived in
// `ContentCatalog` from the post bucket — they are NOT stored here so
// a hot post's likes/views/comments churn never write-amplifies the
// taxonomy table.
export const category = pgTable(
  'category',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    name: varchar('name', { length: 20 }).unique().notNull(),
    slug: varchar('slug', { length: 80 }).unique().notNull(),
    cover: text('cover').notNull(),
    description: text('description').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [index('idx_category_slug').on(table.slug), index('idx_category_sort_order').on(table.sortOrder)],
)

// Post tag. CRUD at `/admin/taxonomy/tags`. MDX references tags by `name` (`UNIQUE`);
// `slug` drives `/tags/:slug` (`UNIQUE`).
export const tag = pgTable(
  'tag',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    name: varchar('name', { length: 20 }).unique().notNull(),
    slug: varchar('slug', { length: 80 }).unique().notNull(),
  },
  (table) => [index('idx_tag_slug').on(table.slug)],
)
