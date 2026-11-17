import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Friend links for the public grid (`<Friends />`, `show_friends` on pages).
// No `slug`/`sortOrder`: the renderer keys on `homepage` and shuffles order.
// `homepage` soft-uniqueness is enforced at the service layer, not a DB UNIQUE.
export const friend = sqliteTable(
  'friend',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    website: text('website').notNull(),
    description: text('description'),
    homepage: text('homepage').notNull(),
    poster: text('poster').notNull(),
    rssUrl: text('rss_url'),
    visible: integer('visible', { mode: 'boolean' }).default(true).notNull(),
  },
  (table) => [index('idx_friend_visible').on(table.visible), index('idx_friend_homepage').on(table.homepage)],
)
