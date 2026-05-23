import {
  bigint,
  bigserial,
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'

// Page business-identity table. Owns one row per page (about / links /
// guestbook / …) and, for each row, the metadata an admin edits in
// the right-hand "metadata" panel of the editor. The actual
// PortableText body and its history live in the shared `content`
// table below — `page` only points to the currently-published
// revision via `published_revision_id`.
//
// Field design rationale:
// - `slug` drives the public `/:slug` URL (varchar(80) is the same
//   ceiling enforced on category/tag slugs and is plenty for human-
//   chosen handles like `about` / `friends` / `guestbook`).
//
//   IMPORTANT: page slugs share a global namespace with post slugs.
//   The DB-level `UNIQUE(slug)` here only enforces page↔page;
//   page↔post collisions are caught by `validateSlugFence` inside
//   `@/server/domains/pages/fence`.
// - `title` / `summary` / `cover` / `og` mirror the post card surface — kept on
//   the meta row so listings and feeds avoid joining `content`.
// - `published` / `comments_enabled` / `show_toc` / `show_updated` are
//   boolean toggles the admin flips without writing a new revision
//   (these are metadata, not body), so they live on `page` rather than
//   `content`. `show_updated` opts into rendering the「修改于 XXXX」
//   secondary timestamp next to the first-publish date on the public
//   detail page; defaults false so most pages stay single-date.
// - `published_at` schedules visibility (`published_at <= now()` for the
//   catalog) and updates on republish; public `<time>` uses
//   `first_published_at` when set.
// - `published_revision_id` is a foreign key into `content.id`. NULL
//   means "never published yet" — the public catalog hides such
//   rows. We deliberately don't enforce the FK in DDL because the
//   runtime guarantees ordering (`content` row exists before
//   `page.published_revision_id` is updated to point at it within
//   the same transaction).
// - `deleted_at` follows the soft-delete convention used by every
//   other long-lived row (friend / image / music).
//   `/admin/pages/restore` flips it back to NULL.
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
    // When true the public detail route renders the「修改于 XXXX」
    // secondary timestamp alongside the first-publish date. Defaults
    // false so most pages stay single-date — operators opt in per page
    // from the meta sidebar (next to the TOC toggle).
    showUpdated: boolean('show_updated').notNull().default(false),
    // When true, append the global friends grid (same as optional `<Friends />`
    // in post MDX). Controlled from the editor meta sidebar without republishing
    // the body. Defaults false; `links` is the usual opt-in.
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
    index('idx_page_slug').on(table.slug),
    index('idx_page_deleted_at').on(table.deletedAt),
    index('idx_page_first_published_at').on(table.firstPublishedAt),
  ],
)

export type PageMetaRow = typeof page.$inferSelect
export type NewPageMeta = typeof page.$inferInsert
