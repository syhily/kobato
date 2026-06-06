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

// TimescaleDB hypertable; retention/compression live in the migration.
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

// Cross-table slug uniqueness guard (complements per-table UNIQUE).
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
