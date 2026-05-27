import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, eq, isNull } from 'drizzle-orm'

import type { NewPostMeta, PostMetaRow } from '@/server/infra/db/types'

import { post as postMetaTable } from '@/server/infra/db/schema/post'

export async function insertPostMeta(db: NodePgDatabase, values: NewPostMeta): Promise<PostMetaRow> {
  const rows = await db.insert(postMetaTable).values(values).returning()
  return rows[0]
}

export async function updatePostMetaById(
  db: NodePgDatabase,
  id: bigint,
  patch: Partial<Omit<NewPostMeta, 'id' | 'createdAt'>>,
): Promise<PostMetaRow | null> {
  const rows = await db
    .update(postMetaTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(postMetaTable.id, id))
    .returning()
  return rows[0] ?? null
}

export async function softDeletePostMeta(db: NodePgDatabase, id: bigint): Promise<boolean> {
  const now = new Date()
  const rows = await db
    .update(postMetaTable)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(postMetaTable.id, id), isNull(postMetaTable.deletedAt)))
    .returning({ id: postMetaTable.id })
  return rows.length > 0
}

export async function restorePostMeta(db: NodePgDatabase, id: bigint): Promise<boolean> {
  const rows = await db
    .update(postMetaTable)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(eq(postMetaTable.id, id))
    .returning({ id: postMetaTable.id })
  return rows.length > 0
}
