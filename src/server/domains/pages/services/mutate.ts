import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { AdminPageDto } from '@/server/domains/pages/projection'

import { clearContentCaches } from '@/server/domains/content/shared'
import { rethrowSlugConflict } from '@/server/domains/content/slug-conflict'
import { reclaimSlugOnRestore } from '@/server/domains/content/slug-reclaim'
import { toAdminPageDto } from '@/server/domains/pages/projection'
import {
  findPageMetaById,
  findPageMetaBySlugForUpdate,
  insertPageMeta,
  restorePageMeta,
  softDeletePageMeta,
  updatePageMetaById,
} from '@/server/domains/pages/repo'
import { type UpsertPageMetaInput } from '@/server/domains/pages/services/shared'
import {
  deleteSlugRegistryByEntity,
  insertSlugRegistry,
  updateSlugRegistryByEntity,
} from '@/server/infra/db/operations/slug-registry'
import { DomainError } from '@/server/infra/http/errors'
import { ensureSlugLegal, resolveSlug } from '@/server/infra/slug-validation'
import { reserveSlugInTransaction } from '@/server/infra/slug/reservation'

export async function createPage(
  db: NodePgDatabase,
  input: UpsertPageMetaInput,
  authorId: bigint | null,
): Promise<AdminPageDto> {
  const slug = resolveSlug(input.slug, input.title)
  ensureSlugLegal(slug, 'page')

  const row = await db.transaction(async (tx) => {
    // Lock slug rows so concurrent creation with the same slug serialises.
    await reserveSlugInTransaction(tx, 'page', slug, undefined, {
      findOwnMetaBySlugForUpdate: findPageMetaBySlugForUpdate,
    })

    const now = new Date()
    let inserted: Awaited<ReturnType<typeof insertPageMeta>>
    try {
      inserted = await insertPageMeta(tx, {
        slug,
        title: input.title,
        summary: input.summary ?? '',
        cover: input.cover ?? '',
        og: input.og ?? null,
        published: false,
        commentsEnabled: input.commentsEnabled ?? true,
        showToc: input.showToc ?? false,
        showUpdated: input.showUpdated ?? false,
        showFriends: input.showFriends ?? false,
        publishedAt: input.publishedAt ?? now,
        authorId,
      })
      await insertSlugRegistry(tx, { slug, entityType: 'page', entityId: inserted.id })
    } catch (err) {
      rethrowSlugConflict(err, 'page', slug)
    }
    return inserted
  })
  await clearContentCaches(db, 'page', row.id)
  return toAdminPageDto(row)
}

export async function updatePageMeta(db: NodePgDatabase, input: UpsertPageMetaInput): Promise<AdminPageDto> {
  if (input.id === undefined) {
    throw new DomainError('BAD_REQUEST', 'updatePageMeta requires an id')
  }
  const pageId = input.id
  const slug = resolveSlug(input.slug, input.title)
  ensureSlugLegal(slug, 'page')
  const existing = await findPageMetaById(db, pageId)
  if (existing === null) {
    throw new DomainError('NOT_FOUND', '页面不存在或已被删除。')
  }

  const updated = await db.transaction(async (tx) => {
    if (existing.slug !== slug) {
      await reserveSlugInTransaction(tx, 'page', slug, pageId, {
        findOwnMetaBySlugForUpdate: findPageMetaBySlugForUpdate,
      })
    }

    let result: Awaited<ReturnType<typeof updatePageMetaById>>
    try {
      result = await updatePageMetaById(tx, pageId, {
        slug,
        title: input.title,
        summary: input.summary ?? existing.summary,
        cover: input.cover ?? existing.cover,
        og: input.og === undefined ? existing.og : input.og,
        commentsEnabled: input.commentsEnabled ?? existing.commentsEnabled,
        showToc: input.showToc ?? existing.showToc,
        showUpdated: input.showUpdated ?? existing.showUpdated,
        showFriends: input.showFriends ?? existing.showFriends,
        publishedAt: input.publishedAt ?? existing.publishedAt,
      })
      if (existing.slug !== slug) {
        await updateSlugRegistryByEntity(tx, { entityType: 'page', entityId: pageId, slug })
      }
    } catch (err) {
      rethrowSlugConflict(err, 'page', slug)
    }
    return result
  })
  if (updated === null) {
    throw new DomainError('NOT_FOUND', '页面不存在或已被删除。')
  }
  await clearContentCaches(db, 'page', pageId)
  return toAdminPageDto(updated)
}

export async function deletePage(db: NodePgDatabase, id: bigint): Promise<{ deleted: boolean }> {
  const result = await db.transaction(async (tx) => {
    const deleted = await softDeletePageMeta(tx, id)
    if (deleted) {
      await deleteSlugRegistryByEntity(tx, { entityType: 'page', entityId: id })
    }
    return { deleted }
  })
  if (result.deleted) {
    await clearContentCaches(db, 'page', id)
  }
  return result
}

export async function restorePage(db: NodePgDatabase, id: bigint): Promise<{ restored: boolean; warning?: string }> {
  const result = await db.transaction(async (tx) => {
    const restored = await restorePageMeta(tx, id)
    if (restored) {
      const meta = await findPageMetaById(tx, id)
      if (meta !== null) {
        const warning = await reclaimSlugOnRestore(tx, 'page', id, meta.slug)
        if (warning !== undefined) {
          return { restored: true, warning }
        }
      }
    }
    return { restored }
  })
  if (result.restored) {
    await clearContentCaches(db, 'page', id)
  }
  return result
}

export async function unpublishPage(db: NodePgDatabase, id: bigint): Promise<AdminPageDto> {
  const existing = await findPageMetaById(db, id)
  if (existing === null) {
    throw new DomainError('NOT_FOUND', '页面不存在或已被删除。')
  }
  const updated = await updatePageMetaById(db, id, { published: false })
  if (updated === null) {
    throw new DomainError('NOT_FOUND', '页面不存在或已被删除。')
  }
  await clearContentCaches(db, 'page', id)
  return toAdminPageDto(updated)
}
