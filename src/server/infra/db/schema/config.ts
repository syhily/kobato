import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

import { user } from '@/server/infra/db/schema/user'

export const setting = sqliteTable('setting', {
  id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
  scope: text('scope').unique().notNull().default('blog'),
  data: text('data', { mode: 'json' })
    .notNull()
    .$defaultFn(() => ({})),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedBy: integer('updated_by'),
})

// Append-only page-view telemetry. TEMPORARY home: this table moves to
// the embedded DuckDB sidecar (see docs/plans/sqlite-migration.md §1.5)
// in the analytics phase — it stays here only so the analytics domain
// keeps compiling until then. Retention runs in the daily maintenance
// job (not a DB policy).
export const accessLog = sqliteTable(
  'access_log',
  {
    ts: integer('ts', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),

    visitorHash: text('visitor_hash').notNull(),
    sessionId: text('session_id'),

    ip: text('ip'),

    path: text('path').notNull(),
    entityType: text('entity_type').$type<'post' | 'page'>(),
    entityId: integer('entity_id'),

    referer: text('referer'),
    refererHost: text('referer_host'),

    country: text('country'),
    region: text('region'),
    city: text('city'),
    latitude: real('latitude'),
    longitude: real('longitude'),
    timezone: text('timezone'),

    language: text('language'),

    ua: text('ua'),
    browser: text('browser'),
    browserVersion: text('browser_version'),
    os: text('os'),
    osVersion: text('os_version'),
    device: text('device'),
    deviceType: text('device_type'),

    isBot: integer('is_bot', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [
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

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    action: text('action').notNull(),
    actorId: integer('actor_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    actorRole: text('actor_role'),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    details: text('details', { mode: 'json' }),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
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

// Cross-table slug uniqueness guard (complements per-table UNIQUE).
export const slugRegistry = sqliteTable(
  'slug_registry',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    slug: text('slug').notNull(),
    entityType: text('entity_type').$type<'page' | 'post'>().notNull(),
    entityId: integer('entity_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
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
