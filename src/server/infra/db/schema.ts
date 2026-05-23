import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  boolean,
  doublePrecision,
  index,
  inet,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  vector,
} from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'

import type { CommentBody } from '@/shared/pt/comment-schema'

// Per-entity metric counters keyed on `(type, owner_id)` where `type` is
// `'post' | 'page'` and `owner_id` references `post.id` / `page.id`.
// Counters move with single-row UPDATEs from the comment + like flows,
// so the table stays narrow on purpose. `public_id` is the opaque UUID
// exposed on the public API wire (the field still named `page_key` on
// the request/response envelope) so numeric ids never reach the browser.
// `(type, owner_id)` is the application-side join key; `public_id` is
// the wire-side identifier — both are unique.
export const metric = pgTable(
  'metric',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    // Populated by `ensureMetric(type, ownerId)` on every metric
    // upsert. `publicId` is the opaque UUID surfaced to public clients
    // in place of the historical URL-based `key`. `type` mirrors the
    // `content` table convention (`varchar(16)`, no DB enum, see the
    // `content` discriminator comment block below) so future entity
    // types extend without a `pg_enum_add` migration.
    type: varchar('type', { length: 16 }).$type<'post' | 'page'>().notNull(),
    ownerId: bigint('owner_id', { mode: 'bigint' }).notNull(),
    publicId: uuid('public_id')
      .notNull()
      .default(sql`gen_random_uuid()`)
      .$defaultFn(() => randomUUID()),
    voteUp: bigint('vote_up', { mode: 'number' }),
    voteDown: bigint('vote_down', { mode: 'number' }),
    pv: bigint('pv', { mode: 'number' }),
  },
  (table) => [
    uniqueIndex('uq_metric_public_id').on(table.publicId),
    uniqueIndex('uq_metric_owner').on(table.type, table.ownerId),
    index('idx_metric_deleted_at').on(table.deletedAt),
  ],
)

export const like = pgTable(
  'like',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).$defaultFn(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    token: varchar('token', { length: 255 }),
    type: varchar('type', { length: 16 }).$type<'post' | 'page'>().notNull(),
    ownerId: bigint('owner_id', { mode: 'bigint' }).notNull(),
  },
  (table) => [index('idx_like_token').on(table.token), index('idx_like_owner').on(table.type, table.ownerId)],
)

export const comment = pgTable(
  'comment',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    content: text('content').default(''),
    body: jsonb('body')
      .$type<CommentBody>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    type: varchar('type', { length: 16 }).$type<'post' | 'page'>().notNull(),
    ownerId: bigint('owner_id', { mode: 'bigint' }).notNull(),
    userId: bigint('user_id', { mode: 'bigint' }).notNull(),
    isVerified: boolean('is_verified').default(false),
    ua: text('ua'),
    ip: text('ip'),
    rid: bigint('rid', { mode: 'number' }).notNull().default(0),
    isCollapsed: boolean('is_collapsed').default(false),
    isPending: boolean('is_pending').default(false),
    isPinned: boolean('is_pinned').default(false),
    voteUp: bigint('vote_up', { mode: 'number' }),
    voteDown: bigint('vote_down', { mode: 'number' }),
    rootId: bigint('root_id', { mode: 'bigint' }),
    deleteRequestedAt: timestamp('delete_requested_at', { withTimezone: true, mode: 'date' }),
    deleteRequestedBy: bigint('delete_requested_by', { mode: 'bigint' }),
  },
  (table) => [
    index('idx_comment_root_id').on(table.rootId),
    index('idx_comment_rid').on(table.rid),
    index('idx_comment_user_id').on(table.userId),
    index('idx_comment_owner').on(table.type, table.ownerId),
    index('idx_comment_deleted_at').on(table.deletedAt),
    index('idx_comment_delete_requested_at').on(table.deleteRequestedAt),
  ],
)

// RBAC role enum. Declared as a real Postgres ENUM (not a CHECK
// constraint or varchar+TS-only enforcement) so a stray
// `UPDATE user SET role = 'editor'` from a DB client is rejected at
// the DB perimeter. Adding a new role later is a separate migration
// (`ALTER TYPE user_role ADD VALUE`), which is a fair price for the
// stronger guarantee.
export const userRoleEnum = pgEnum('user_role', ['admin', 'author', 'visitor'])

export const user = pgTable(
  'user',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).unique().notNull(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    link: text('link'),
    password: text('password').notNull(),
    badgeName: text('badge_name'),
    badgeColor: text('badge_color'),
    // Optional manual override for the badge text colour. When `null`
    // (the historical default for every existing row) the public
    // renderer falls back to `commentBadgeTextColor()`'s WCAG-based
    // auto-pick so older accounts keep working without an admin sweep.
    badgeTextColor: text('badge_text_color'),
    lastIp: text('last_ip'),
    lastUa: text('last_ua'),
    role: userRoleEnum('role'),
    isMuted: boolean('is_muted').default(false).notNull(),
    receiveEmail: boolean('receive_email').default(true),
  },
  (table) => [
    index('idx_users_email').on(table.email),
    index('idx_users_name').on(table.name),
    index('idx_users_deleted_at').on(table.deletedAt),
    // Partial: skip anonymous placeholder rows (role IS NULL) — they're 80%+
    // of the table on a mature install and have no role-based query needs.
    index('idx_user_role')
      .on(table.role)
      .where(sql`role IS NOT NULL`),
  ],
)

// One-shot tokens for password reset and author invite. Previously
// the row identity was a single `identifier text` column shaped as
// `<purpose>:<userId>` — that conflated two concerns into one column,
// had no UNIQUE constraint, and forced bigint userIds through a
// string-split / parseInt detour. Splitting `purpose` and `userId`
// into two real columns lets the `(purpose, userId)` UNIQUE index do
// its job (one live token per purpose per user) and lets the
// application stay bigint end-to-end.
export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    purpose: varchar('purpose', { length: 32 }).notNull(),
    userId: bigint('user_id', { mode: 'bigint' }).notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at')
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at')
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_verification_value').on(table.value),
    uniqueIndex('uq_verification_purpose_user').on(table.purpose, table.userId),
  ],
)

// Friend links for the public grid (`<Friends />` in posts, `show_friends` on
// pages). CRUD at `/admin/friends`.
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

// Post category. CRUD at `/admin/categories`. MDX references categories by
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

// Post tag. CRUD at `/admin/tags`. MDX references tags by `name` (`UNIQUE`);
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

// Image library backing the admin "图片管理" surface.
//
// Every row represents an object uploaded through the admin panel
// into the configured S3-compatible bucket; `storagePath` is the S3
// object key (e.g. `images/2026/05/2026050214321999.jpg`,
// `images/categories/<slug>.jpg`, `images/links/<host>.jpg`) and the
// public URL is `<publicBaseUrl>/<storagePath>` at runtime.
//
// `width` / `height` / `byteSize` are populated from the upload
// pipeline (sharp metadata after the JPEG re-encode); `thumbhash` is
// a base64 string consumed by the runtime placeholder hook.
//
// `storagePath` is `UNIQUE` so the upload service can `ON CONFLICT
// DO UPDATE` on the state-keyed kinds (category / friend) without a
// pre-flight SELECT. The `kind=generic` upload always picks a
// timestamp key so it should not collide in practice; the unique
// constraint catches any pathological case loudly.
export const image = pgTable(
  'image',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    storagePath: varchar('storage_path', { length: 500 }).unique().notNull(),
    mimeType: varchar('mime_type', { length: 60 }).notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    thumbhash: text('thumbhash'),
    uploaderId: bigint('uploader_id', { mode: 'bigint' }),
    note: text('note'),
  },
  (table) => [index('idx_image_created_at').on(table.createdAt), index('idx_image_deleted_at').on(table.deletedAt)],
)

// Music library backing the admin "音乐管理" surface and the
// `<MusicPlayer />` MDX component.
//
// Every row represents a song whose audio + cover have been
// downloaded from a third-party music provider (currently only
// `netease` via `@meting/core`) into the same S3 bucket the image
// library uses. Audio lives at `musics/<playerId>.mp3`, cover at
// `musics/<playerId>.jpg` (300×300 JPEG re-encoded by `sharp`).
//
// Key shape:
// - `(source, sourceId)` is the business unique key. `source` is a
//   varchar instead of an enum so future providers (tencent, kugou,
//   …) only require an application-layer change. `sourceId` is the
//   provider-side song id.
// - `playerId` is a 16-char `[a-z0-9]` opaque handle generated server-
//   side (collision-retry once). It is what MDX writes:
//   `<MusicPlayer id="7hk2pqrxyzabc012" />` and what the public GET
//   API keys on. Decoupling it from `sourceId` means the public URL
//   does not leak the provider id and a future provider switch will
//   not invalidate the MDX corpus.
// - `audioStoragePath` / `coverStoragePath` are unique S3 keys, so
//   re-importing the same song is a hard constraint violation rather
//   than silent overwrite.
// - `lyric` stores the raw LRC text inline so the public GET API can
//   return audio + cover URL + lyric in a single query.
export const music = pgTable(
  'music',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    source: varchar('source', { length: 20 }).notNull(),
    sourceId: varchar('source_id', { length: 64 }).notNull(),
    playerId: varchar('player_id', { length: 16 }).unique().notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    artist: varchar('artist', { length: 200 }).notNull(),
    album: varchar('album', { length: 200 }).notNull(),
    audioStoragePath: varchar('audio_storage_path', { length: 500 }).unique().notNull(),
    coverStoragePath: varchar('cover_storage_path', { length: 500 }).unique().notNull(),
    lyric: text('lyric'),
    uploaderId: bigint('uploader_id', { mode: 'bigint' }),
  },
  (table) => [
    uniqueIndex('uq_music_source_source_id').on(table.source, table.sourceId),
    index('idx_music_player_id').on(table.playerId),
    index('idx_music_created_at').on(table.createdAt),
    index('idx_music_deleted_at').on(table.deletedAt),
  ],
)

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

export const post = pgTable(
  'post',
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
    // Same semantics as `page.show_updated` — defaults false; flip on
    // for the rare post that wants its「修改于 XXXX」 secondary date
    // displayed in the meta row.
    showUpdated: boolean('show_updated').notNull().default(false),
    visible: boolean('visible').notNull().default(true),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    publishedRevisionId: bigint('published_revision_id', { mode: 'bigint' }),
    /** The timestamp of the first publication. Immutable after set. */
    firstPublishedAt: timestamp('first_published_at', { withTimezone: true, mode: 'date' }),
    /** Author who created the post. NULL for legacy migrated posts. */
    authorId: bigint('author_id', { mode: 'bigint' }),
    // Post-specific taxonomy fields
    category: varchar('category', { length: 20 }).notNull().default(''),
    tags: jsonb('tags')
      .notNull()
      .default(sql`'[]'::jsonb`),
    alias: jsonb('alias')
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** When set, the post is pinned to the home feature area. */
    pinnedAt: timestamp('pinned_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('idx_post_slug').on(table.slug),
    index('idx_post_deleted_at').on(table.deletedAt),
    index('idx_post_category').on(table.category),
    index('idx_post_published_at').on(table.publishedAt),
    index('idx_post_first_published_at').on(table.firstPublishedAt),
    index('idx_post_pinned_at').on(table.pinnedAt),
  ],
)

// Shared revision repository for both pages and (eventually) posts.
//
// Why a single shared table instead of `page_revision` / `post_revision`?
// 1. PortableText body shape is identical between the two; splitting
//    forces two near-identical projections.
// 2. The editor save/publish state machine is also identical (draft
//    branches off the latest revision, publish promotes one row).
// 3. Cross-content features added later — e.g. "where is image X
//    embedded?" or "global trash bin" — are a single index scan on
//    `content` instead of a UNION of two history tables.
//
// Discriminator pair `(type, owner_id)`:
// - `type` is `'page' | 'post'` (no DB enum — keep it varchar so a
//   future `'note'` / `'snippet'` doesn't require a `pg_enum_add`
//   migration).
// - `owner_id` references `page.id` when type='page' and (in the
//   future) the corresponding `post.id`. The FK is **not** enforced
//   in DDL: a polymorphic FK isn't expressible without a CHECK +
//   trigger pair, and the application layer guarantees the invariant
//   inside transactions where it matters.
//
// Revision numbering:
// - `revision_no` is monotonically increasing **per (type, owner_id)**.
//   The unique index `uq_content_owner_revision` enforces no two
//   revisions of the same owner share a number; the service layer
//   acquires `SELECT … FOR UPDATE` on the page row before computing
//   `MAX(revision_no) + 1` so concurrent saves serialise correctly.
//
// Status:
// - `'draft'` is the in-progress revision the editor writes back to
//   on every autosave; `'published'` is immutable and exactly one row
//   per owner is referenced by `page.published_revision_id` at any
//   given time. The transition is one-way (publishing a draft flips
//   it to `'published'`; further edits create a new draft on top).
//
// Optimistic concurrency:
// - `client_revision_token` is a UUID rotated on every server-side
//   write. The editor sends the token it last received; the service
//   layer rejects writes whose token doesn't match the row's current
//   token, surfacing a "conflict, choose a side" diff in the UI.
//
// Snapshot fields:
// - `body` is the canonical PortableText (`PortableTextBlock[]`)
//   payload. Validated by `@/shared/pt/schema` at the API
//   perimeter so a malformed payload never lands.
// - `image_sources` is the array of S3 storagePath values referenced
//   by the body, denormalised so the SSR enhancer can resolve
//   thumbhashes in a single `WHERE storage_path IN (…)` lookup
//   without re-walking the body tree.
// - `headings` is the structured TOC array (`{depth, text, slug}[]`),
//   pre-computed at save time so SSR doesn't re-parse PortableText
//   to render the right-hand TOC widget.
// - `author_id` records who saved the revision (NULL only for the
//   migration script that backfills the initial publication).
export const content = pgTable(
  'content',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    type: varchar('type', { length: 16 }).notNull(),
    ownerId: bigint('owner_id', { mode: 'bigint' }).notNull(),
    revisionNo: integer('revision_no').notNull(),
    status: varchar('status', { length: 16 }).notNull().default('draft'),
    body: jsonb('body')
      .notNull()
      .default(sql`'[]'::jsonb`),
    imageSources: jsonb('image_sources')
      .notNull()
      .default(sql`'[]'::jsonb`),
    headings: jsonb('headings')
      .notNull()
      .default(sql`'[]'::jsonb`),
    authorId: bigint('author_id', { mode: 'bigint' }),
    clientRevisionToken: uuid('client_revision_token')
      .notNull()
      .$defaultFn(() => randomUUID()),
  },
  (table) => [
    uniqueIndex('uq_content_owner_revision').on(table.type, table.ownerId, table.revisionNo),
    index('idx_content_owner_status').on(table.type, table.ownerId, table.status),
    index('idx_content_status').on(table.status),
  ],
)

// Section-scoped store for the editable blog configuration. One row per
// `scope`; the admin panel writes one row per settings section, named
// `blog.<section>` (e.g. `blog.general`, `blog.assets`,
// `blog.mail`, …). Splitting the previously-singleton `blog` row this
// way means a save to one section never reads, merges, or rewrites the
// JSONB belonging to any other section, so concurrent edits on
// different tabs cannot race each other. The full snapshot is
// reassembled in memory by `hydrateBlogSettings()` via a single
// `WHERE scope LIKE 'blog.%'` SELECT.
export const setting = pgTable('setting', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey().notNull(),
  scope: varchar('scope', { length: 64 }).unique().notNull().default('blog'),
  data: jsonb('data')
    .notNull()
    .default(sql`'{}'::jsonb`),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedBy: bigint('updated_by', { mode: 'bigint' }),
})

// Search index for posts: plain text extracted from PortableText bodies,
// plus an optional OpenAI embedding for vector similarity search.
// Kept in a separate table so the main `post` table stays narrow.
export const postSearchIndex = pgTable(
  'post_search_index',
  {
    postId: bigint('post_id', { mode: 'bigint' }).primaryKey().notNull(),
    plainText: text('plain_text').notNull().default(''),
    embedding: vector('embedding', { dimensions: 1536 }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`)
      .$defaultFn(() => new Date()),
  },
  (table) => [index('idx_post_search_embedding').using('hnsw', table.embedding.op('vector_cosine_ops'))],
)

export type PageMetaRow = typeof page.$inferSelect
export type NewPageMeta = typeof page.$inferInsert
export type PostMetaRow = typeof post.$inferSelect
export type NewPostMeta = typeof post.$inferInsert

// Append-only time-series access log feeding the analytics dashboard
// (`/admin/analytics`). One row per non-bot SSR request to a content
// route. Backed by a TimescaleDB hypertable created in the companion
// `*_access_log_timescale` migration; the Drizzle definition only
// declares the relational shape.
//
// Two columns deserve a comment block:
//
// - `(entity_type, entity_id)` discriminator mirrors the convention the
//   `metric` / `like` / `comment` tables already use. Plain Postgres
//   columns (no FK) because Timescale hypertables can't reference
//   non-hypertable rows; orphan rows after a hard-delete of a post /
//   page are accepted (the rare admin hard-delete already invalidates
//   counter rows the same way).
//
// - `visitor_hash` is a SHA-256 of `(ip || dailySalt)` truncated to 32
//   hex chars. UV counting `COUNT(DISTINCT visitor_hash)` on a 32-char
//   text column is materially faster than `COUNT(DISTINCT ip)` on
//   `inet`, and the hash survives a future "drop raw IP" pivot without
//   breaking the dashboards. We deliberately store both — see
//   `docs/blog-analytics-plan.md §6.1`.
//
// Retention / compression / continuous aggregates live in the Timescale
// migration; do NOT replicate those policies in Drizzle DDL.
export const accessLog = pgTable(
  'access_log',
  {
    ts: timestamp('ts', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),

    visitorHash: text('visitor_hash').notNull(),
    sessionId: text('session_id'),

    ip: inet('ip'),

    path: text('path').notNull(),
    entityType: varchar('entity_type', { length: 16 }).$type<'post' | 'page'>(),
    entityId: bigint('entity_id', { mode: 'bigint' }),

    referer: text('referer'),
    refererHost: text('referer_host'),

    country: text('country'),
    region: text('region'),
    city: text('city'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    timezone: text('timezone'),

    language: text('language'),

    ua: text('ua'),
    browser: text('browser'),
    browserVersion: text('browser_version'),
    os: text('os'),
    osVersion: text('os_version'),
    device: text('device'),
    deviceType: text('device_type'),

    isBot: boolean('is_bot').notNull().default(false),
  },
  (table) => [
    // Compound indexes covering the common dashboard query shapes.
    // Timescale also auto-creates `(ts DESC)` per chunk so we don't
    // duplicate that here.
    index('idx_access_log_entity_ts').on(table.entityType, table.entityId, table.ts),
    index('idx_access_log_path_ts').on(table.path, table.ts),
    index('idx_access_log_country_ts').on(table.country, table.ts),
    index('idx_access_log_visitor_ts').on(table.visitorHash, table.ts),
    index('idx_access_log_referer_host_ts').on(table.refererHost, table.ts),
    index('idx_access_log_is_bot_ts').on(table.isBot, table.ts),
  ],
)

export type AccessLogRow = typeof accessLog.$inferSelect
export type NewAccessLog = typeof accessLog.$inferInsert

// ---------------------------------------------------------------------------
// Audit log — durable record of admin mutations, auth events, and settings
// changes. Written asynchronously (fire-and-forget) so the hot path never
// blocks on the insert.
// ---------------------------------------------------------------------------
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    action: varchar('action', { length: 50 }).notNull(),
    actorId: bigint('actor_id', { mode: 'bigint' }).references(() => user.id, {
      onDelete: 'set null',
    }),
    actorRole: varchar('actor_role', { length: 20 }),
    resourceType: varchar('resource_type', { length: 50 }).notNull(),
    resourceId: varchar('resource_id', { length: 100 }),
    details: jsonb('details'),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_audit_log_actor').on(table.actorId),
    index('idx_audit_log_resource').on(table.resourceType, table.resourceId),
    index('idx_audit_log_created_at').on(table.createdAt),
    index('idx_audit_log_action').on(table.action),
    index('idx_audit_log_action_created_at').on(table.action, table.createdAt),
  ],
)

// ---------------------------------------------------------------------------
// Slug registry — global uniqueness enforcement for page ↔ post slugs.
//
// Both `page` and `post` have their own `UNIQUE(slug)`, but that only
// catches collisions within the same table.  This registry guarantees
// cross-table uniqueness at the database level, eliminating the race
// condition that the old application-level `validateSlugFence` could not
// prevent.
// ---------------------------------------------------------------------------
export const slugRegistry = pgTable(
  'slug_registry',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey().notNull(),
    slug: varchar('slug', { length: 80 }).notNull(),
    entityType: varchar('entity_type', { length: 16 }).$type<'page' | 'post'>().notNull(),
    entityId: bigint('entity_id', { mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('uq_slug_registry_slug').on(table.slug),
    uniqueIndex('uq_slug_registry_entity').on(table.entityType, table.entityId),
  ],
)

export type SlugRegistryRow = typeof slugRegistry.$inferSelect
export type NewSlugRegistry = typeof slugRegistry.$inferInsert

export type AuditLogRow = typeof auditLog.$inferSelect
export type NewAuditLog = typeof auditLog.$inferInsert
