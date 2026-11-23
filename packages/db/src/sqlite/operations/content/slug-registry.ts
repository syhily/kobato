import type { Database } from '@kobato/db/sqlite/database'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { slugRegistry } from '@kobato/db/sqlite/schema/config'
import { eq, and } from 'drizzle-orm'

export function insertSlugRegistry(
  db: Database,
  {
    slug,
    entityType,
    entityId,
  }: {
    slug: string
    entityType: 'page' | 'post'
    entityId: number
  },
) {
  const rows = sqliteOf(db).insert(slugRegistry).values({ slug, entityType, entityId }).returning().all()
  return rows[0]
}

export function updateSlugRegistryByEntity(
  db: Database,
  {
    entityType,
    entityId,
    slug,
  }: {
    entityType: 'page' | 'post'
    entityId: number
    slug: string
  },
) {
  const rows = sqliteOf(db)
    .update(slugRegistry)
    .set({ slug })
    .where(and(eq(slugRegistry.entityType, entityType), eq(slugRegistry.entityId, entityId)))
    .returning()
    .all()
  return rows[0] ?? null
}

export function deleteSlugRegistryByEntity(
  db: Database,
  {
    entityType,
    entityId,
  }: {
    entityType: 'page' | 'post'
    entityId: number
  },
) {
  sqliteOf(db)
    .delete(slugRegistry)
    .where(and(eq(slugRegistry.entityType, entityType), eq(slugRegistry.entityId, entityId)))
    .run()
}

export function findSlugRegistryBySlug(db: Database, slug: string) {
  const rows = sqliteOf(db).select().from(slugRegistry).where(eq(slugRegistry.slug, slug)).limit(1).all()
  return rows[0] ?? null
}

export function findSlugRegistryBySlugForUpdate(db: Database, slug: string) {
  const rows = sqliteOf(db).select().from(slugRegistry).where(eq(slugRegistry.slug, slug)).limit(1).all()
  return rows[0] ?? null
}
