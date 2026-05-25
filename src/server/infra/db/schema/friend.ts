import { bigserial, boolean, index, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'

// Friend links for the public grid (`<Friends />` in posts, `show_friends` on
// pages). CRUD at `/admin/library/friends`.
//
// Field design:
// - No `slug`: the YAML's `slug` was an authoring shorthand only — the
//   public renderer keys on `homepage` and the admin shell keys on
//   `id`, neither of which needs a separate handle.
// - No `sortOrder`: friends render in random order
//   (`@/ui/pt/blocks/Friends.tsx` already shuffles), so no ranking is
//   stored. Admin list sorts by `createdAt desc` (newest first).
// - Soft-uniqueness on `homepage` is enforced at the service layer
//   (CLI import + admin upsert): a strict DB UNIQUE would reject
//   protocol/trailing-slash variants the editor probably meant as
//   updates.
export const friend = pgTable(
  'friend',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    website: varchar('website', { length: 80 }).notNull(),
    description: text('description'),
    homepage: text('homepage').notNull(),
    poster: text('poster').notNull(),
    rssUrl: text('rss_url'),
    visible: boolean('visible').default(true).notNull(),
  },
  (table) => [index('idx_friend_visible').on(table.visible), index('idx_friend_homepage').on(table.homepage)],
)
