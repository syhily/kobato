import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { eq, and } from 'drizzle-orm'

import { slugRegistry } from '@/server/infra/db/schema/config'

export async function insertSlugRegistry(
  db: NodePgDatabase,
  {
    slug,
    entityType,
    entityId,
  }: {
    slug: string
    entityType: 'page' | 'post'
    entityId: bigint
  },
) {
  const rows = await db.insert(slugRegistry).values({ slug, entityType, entityId }).returning()
  return rows[0]
}

export async function updateSlugRegistryByEntity(
  db: NodePgDatabase,
  {
    entityType,
    entityId,
    slug,
  }: {
    entityType: 'page' | 'post'
    entityId: bigint
    slug: string
  },
) {
  const rows = await db
    .update(slugRegistry)
    .set({ slug })
    .where(and(eq(slugRegistry.entityType, entityType), eq(slugRegistry.entityId, entityId)))
    .returning()
  return rows[0] ?? null
}

export async function deleteSlugRegistryByEntity(
  db: NodePgDatabase,
  {
    entityType,
    entityId,
  }: {
    entityType: 'page' | 'post'
    entityId: bigint
  },
) {
  await db.delete(slugRegistry).where(and(eq(slugRegistry.entityType, entityType), eq(slugRegistry.entityId, entityId)))
}

export async function findSlugRegistryBySlug(db: NodePgDatabase, slug: string) {
  const rows = await db.select().from(slugRegistry).where(eq(slugRegistry.slug, slug)).limit(1)
  return rows[0] ?? null
}
