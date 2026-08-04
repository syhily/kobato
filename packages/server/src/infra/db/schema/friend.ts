import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Friend links for the public grid (`<Friends />` in posts, `show_friends` on
// pages). CRUD at `/admin/taxonomy/friends`.
//
// Field design:
// - No `slug`: the YAML's `slug` was an authoring shorthand only — the
//   public renderer keys on `homepage` and the admin shell keys on
//   `id`, neither of which needs a separate handle.
// - No `sortOrder`: friends render in random order
//   (`@kobato/ui/pt/blocks/Friends.tsx` already shuffles), so no ranking is
//   stored. Admin list sorts by `createdAt desc` (newest first).
// - Soft-uniqueness on `homepage` is enforced at the service layer
//   (CLI import + admin upsert): a strict DB UNIQUE would reject
//   protocol/trailing-slash variants the editor probably meant as
//   updates.
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
