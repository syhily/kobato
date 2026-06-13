import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { AdminPageDto } from '@/server/domains/pages/projection'

import { toAdminPageDto } from '@/server/domains/pages/projection'
import {
  findPageMetaById,
  findPageMetaBySlugForUpdate,
  insertPageMeta,
  restorePageMeta,
  softDeletePageMeta,
  updatePageMetaById,
} from '@/server/domains/pages/repo'
import { clearPagesCache, type UpsertPageMetaInput } from '@/server/domains/pages/services/shared'
import { clearSitemapCache } from '@/server/infra/cache/sitemap-cache'
import {
  deleteSlugRegistryByEntity,
  findSlugRegistryBySlugForUpdate,
  insertSlugRegistry,
  updateSlugRegistryByEntity,
} from '@/server/infra/db/operations/slug-registry'
import { DomainError, isUniqueConstraintError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { ensureSlugLegal, resolveSlug } from '@/server/infra/slug-validation'

const log = getLogger('pages.service')

async function clearPageCaches(pageId?: bigint): Promise<void> {
  await clearPagesCache()
  await clearSitemapCache().catch((err: unknown) => {
    log.warn('clear sitemap cache failed', { pageId: pageId?.toString(), error: err })
  })
}

export async function createPage(
  db: NodePgDatabase,
  input: UpsertPageMetaInput,
  authorId: bigint | null,
): Promise<AdminPageDto> {
  const slug = resolveSlug(input.slug, input.title)
  ensureSlugLegal(slug, 'page')

  return db.transaction(async (tx) => {
    // Lock slug rows so concurrent creation with the same slug serialises.
    const collision = await findPageMetaBySlugForUpdate(tx, slug)
    if (collision !== null) {
      throw new DomainError('CONFLICT', `slug "${slug}" 已被其它页面占用。`)
    }
    const crossCollision = await findSlugRegistryBySlugForUpdate(tx, slug)
    if (crossCollision !== null && crossCollision.entityType !== 'page') {
      throw new DomainError('CONFLICT', `slug "${slug}" 已被其它文章占用。`)
    }

    const now = new Date()
    let row: Awaited<ReturnType<typeof insertPageMeta>>
    try {
      row = await insertPageMeta(tx, {
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
      await insertSlugRegistry(tx, { slug, entityType: 'page', entityId: row.id })
    } catch (err) {
      if (isUniqueConstraintError(err, 'uq_slug_registry_slug')) {
        throw new DomainError('CONFLICT', `slug "${slug}" 已被占用。`)
      }
      throw err
    }
    await clearPageCaches(row.id)
    return toAdminPageDto(row)
  })
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

  return db.transaction(async (tx) => {
    if (existing.slug !== slug) {
      const collision = await findPageMetaBySlugForUpdate(tx, slug)
      if (collision !== null && collision.id !== pageId) {
        throw new DomainError('CONFLICT', `slug "${slug}" 已被其它页面占用。`)
      }
      const crossCollision = await findSlugRegistryBySlugForUpdate(tx, slug)
      if (crossCollision !== null && crossCollision.entityType !== 'page') {
        throw new DomainError('CONFLICT', `slug "${slug}" 已被其它文章占用。`)
      }
    }

    let updated: Awaited<ReturnType<typeof updatePageMetaById>>
    try {
      updated = await updatePageMetaById(tx, pageId, {
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
      if (isUniqueConstraintError(err, 'uq_slug_registry_slug')) {
        throw new DomainError('CONFLICT', `slug "${slug}" 已被占用。`)
      }
      throw err
    }
    if (updated === null) {
      throw new DomainError('NOT_FOUND', '页面不存在或已被删除。')
    }
    await clearPageCaches(pageId)
    return toAdminPageDto(updated)
  })
}

export async function deletePage(db: NodePgDatabase, id: bigint): Promise<{ deleted: boolean }> {
  return db.transaction(async (tx) => {
    const deleted = await softDeletePageMeta(tx, id)
    if (deleted) {
      await deleteSlugRegistryByEntity(tx, { entityType: 'page', entityId: id })
      await clearPageCaches(id)
    }
    return { deleted }
  })
}

export async function restorePage(db: NodePgDatabase, id: bigint): Promise<{ restored: boolean }> {
  return db.transaction(async (tx) => {
    const restored = await restorePageMeta(tx, id)
    if (restored) {
      const meta = await findPageMetaById(tx, id)
      if (meta !== null) {
        try {
          await insertSlugRegistry(tx, { slug: meta.slug, entityType: 'page', entityId: id })
        } catch (err) {
          if (!isUniqueConstraintError(err, 'uq_slug_registry_slug')) {
            throw err
          }
        }
      }
      await clearPageCaches(id)
    }
    return { restored }
  })
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
  await clearPageCaches(id)
  return toAdminPageDto(updated)
}
