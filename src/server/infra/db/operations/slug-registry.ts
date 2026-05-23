import { eq, and } from 'drizzle-orm'

import { db } from '@/server/infra/db/pool'
import { slugRegistry } from '@/server/infra/db/schema/config'

export async function insertSlugRegistry({
  slug,
  entityType,
  entityId,
}: {
  slug: string
  entityType: 'page' | 'post'
  entityId: bigint
}) {
  const rows = await db.insert(slugRegistry).values({ slug, entityType, entityId }).returning()
  return rows[0]
}

export async function updateSlugRegistryByEntity({
  entityType,
  entityId,
  slug,
}: {
  entityType: 'page' | 'post'
  entityId: bigint
  slug: string
}) {
  const rows = await db
    .update(slugRegistry)
    .set({ slug })
    .where(and(eq(slugRegistry.entityType, entityType), eq(slugRegistry.entityId, entityId)))
    .returning()
  return rows[0] ?? null
}

export async function deleteSlugRegistryByEntity({
  entityType,
  entityId,
}: {
  entityType: 'page' | 'post'
  entityId: bigint
}) {
  await db.delete(slugRegistry).where(and(eq(slugRegistry.entityType, entityType), eq(slugRegistry.entityId, entityId)))
}

export async function findSlugRegistryBySlug(slug: string) {
  const rows = await db.select().from(slugRegistry).where(eq(slugRegistry.slug, slug)).limit(1)
  return rows[0] ?? null
}
