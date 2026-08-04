import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Post category. CRUD at `/admin/taxonomy/categories`. Posts reference a
// category by id (`post.category_id` FK, `ON DELETE SET NULL`), so renames
// cascade with zero post writes. `name` is `UNIQUE`; `slug` drives
// `/cats/:slug` (`UNIQUE`). `sort_order` orders `/categories`.
//
// Counters (`counts` on the public DTO) stay derived from the post table
// via `countPostsByTaxonomy` — they are NOT stored here so
// a hot post's likes/views/comments churn never write-amplifies the
// taxonomy table.
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
  (table) => [
    // `slug` already has a UNIQUE constraint (implicit unique index).
    index('idx_category_sort_order').on(table.sortOrder),
  ],
)

// Post tag. CRUD at `/admin/taxonomy/tags`. Posts reference tags through
// the `post_tag` join (by `tag.id`), so renames propagate automatically;
// `name` is `UNIQUE`, `slug` drives `/tags/:slug` (`UNIQUE`).
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
