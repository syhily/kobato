import type { AdminPageDto } from '@/server/domains/pages/projection'

import { toAdminPageDto } from '@/server/domains/pages/projection'
import {
  findPageMetaById,
  findPageMetaBySlug,
  insertPageMeta,
  restorePageMeta,
  softDeletePageMeta,
  updatePageMetaById,
} from '@/server/domains/pages/repo'
import {
  clearPagesCache,
  ensureSlugLegal,
  resolveSlugForPage,
  type UpsertPageMetaInput,
} from '@/server/domains/pages/services/shared'
import { DomainError } from '@/server/infra/http/errors'

export async function createPage(input: UpsertPageMetaInput, authorId: bigint | null): Promise<AdminPageDto> {
  const slug = resolveSlugForPage(input.slug, input.title)
  ensureSlugLegal(slug)
  // page↔page collision; the cross-table page↔post fence runs in the
  // catalog snapshot rebuild after invalidate.
  const collision = await findPageMetaBySlug(slug)
  if (collision !== null) {
    throw new DomainError('CONFLICT', `slug "${slug}" 已被其它页面占用。`)
  }
  const now = new Date()
  const row = await insertPageMeta({
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
  await clearPagesCache()
  return toAdminPageDto(row)
}

export async function updatePageMeta(input: UpsertPageMetaInput): Promise<AdminPageDto> {
  if (input.id === undefined) {
    throw new DomainError('BAD_REQUEST', 'updatePageMeta requires an id')
  }
  const slug = resolveSlugForPage(input.slug, input.title)
  ensureSlugLegal(slug)
  const existing = await findPageMetaById(input.id)
  if (existing === null) {
    throw new DomainError('NOT_FOUND', '页面不存在或已被删除。')
  }
  if (existing.slug !== slug) {
    const collision = await findPageMetaBySlug(slug)
    if (collision !== null && collision.id !== input.id) {
      throw new DomainError('CONFLICT', `slug "${slug}" 已被其它页面占用。`)
    }
  }
  const updated = await updatePageMetaById(input.id, {
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
  if (updated === null) {
    throw new DomainError('NOT_FOUND', '页面不存在或已被删除。')
  }
  await clearPagesCache()
  return toAdminPageDto(updated)
}

export async function deletePage(id: bigint): Promise<{ deleted: boolean }> {
  const deleted = await softDeletePageMeta(id)
  if (deleted) {
    await clearPagesCache()
  }
  return { deleted }
}

export async function restorePage(id: bigint): Promise<{ restored: boolean }> {
  const restored = await restorePageMeta(id)
  if (restored) {
    await clearPagesCache()
  }
  return { restored }
}

export async function unpublishPage(id: bigint): Promise<AdminPageDto> {
  const existing = await findPageMetaById(id)
  if (existing === null) {
    throw new DomainError('NOT_FOUND', '页面不存在或已被删除。')
  }
  const updated = await updatePageMetaById(id, { published: false })
  if (updated === null) {
    throw new DomainError('NOT_FOUND', '页面不存在或已被删除。')
  }
  await clearPagesCache()
  return toAdminPageDto(updated)
}
