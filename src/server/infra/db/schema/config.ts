import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

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
