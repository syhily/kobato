import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  boolean,
  doublePrecision,
  index,
  inet,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

import { user } from '@/server/infra/db/schema/user'

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
