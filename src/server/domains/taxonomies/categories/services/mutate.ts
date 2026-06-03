import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { AdminCategoryDto, UpsertCategoryInputs } from '@/server/domains/taxonomies/categories/projection'

import { listPostsByCategory } from '@/server/domains/posts/repos/public-query'
import { toAdminCategoryDto } from '@/server/domains/taxonomies/categories/projection'
import {
  deleteAdminTaxonomy,
  ensureUniqueOnCreateTaxonomy,
  ensureUniqueOnUpdateTaxonomy,
  resolveSlugForTaxonomy,
} from '@/server/domains/taxonomies/shared'
import {
  deleteCategory as deleteCategoryRow,
  findCategoryById,
  findCategoryByName,
  findCategoryBySlug,
  insertCategory,
  reorderCategories as reorderCategoryRows,
  updateCategory,
} from '@/server/infra/db/operations/category'
import { DomainError } from '@/server/infra/http/errors'
import { idFromString } from '@/shared/utils/id'

async function categoryPostCounter(db: NodePgDatabase): Promise<(name: string) => Promise<number>> {
  return async (name: string) => {
    const posts = await listPostsByCategory(db, name, { includeHidden: true, includeScheduled: true })
    return posts.length
  }
}

export async function upsertAdminCategory(db: NodePgDatabase, input: UpsertCategoryInputs): Promise<AdminCategoryDto> {
  const slug = resolveSlugForTaxonomy(input.slug, input.name)

  if (input.id === undefined) {
    await ensureUniqueOnCreateTaxonomy(
      (name) => findCategoryByName(db, name),
      (slug) => findCategoryBySlug(db, slug),
      input.name,
      slug,
      '分类',
    )
    const row = await insertCategory(db, {
      name: input.name,
      slug,
      cover: input.cover,
      og: input.og,
      description: input.description,
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    })
    const countOf = await categoryPostCounter(db)
    return toAdminCategoryDto(row, await countOf(row.name))
  }

  const existing = await findCategoryById(db, input.id)
  if (existing === null) {
    throw new DomainError('NOT_FOUND', '分类不存在')
  }
  await ensureUniqueOnUpdateTaxonomy(
    (name) => findCategoryByName(db, name),
    (slug) => findCategoryBySlug(db, slug),
    input.id,
    input.name,
    existing.name,
    slug,
    existing.slug,
    '分类',
  )
  const updated = await updateCategory(db, input.id, {
    name: input.name,
    slug,
    cover: input.cover,
    og: input.og,
    description: input.description,
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
  })
  if (updated === null) {
    throw new DomainError('NOT_FOUND', '分类不存在')
  }
  const countOf = await categoryPostCounter(db)
  return toAdminCategoryDto(updated, await countOf(updated.name))
}

export async function reorderAdminCategories(
  db: NodePgDatabase,
  orderedIds: readonly string[],
): Promise<AdminCategoryDto[]> {
  const seen = new Set<string>()
  for (const id of orderedIds) {
    if (seen.has(id)) {
      throw new DomainError('BAD_REQUEST', '排序请求存在重复的分类 id')
    }
    seen.add(id)
  }

  const { listPublicCategoryRows } = await import('@/server/infra/db/operations/category')
  const liveRows = await listPublicCategoryRows(db)
  if (liveRows.length !== orderedIds.length) {
    throw new DomainError('CONFLICT', '排序与最新分类列表不一致，请刷新后重试')
  }
  const liveIds = new Set(liveRows.map((row) => String(row.id)))
  for (const id of orderedIds) {
    if (!liveIds.has(id)) {
      throw new DomainError('CONFLICT', '排序与最新分类列表不一致，请刷新后重试')
    }
  }

  const updated = await reorderCategoryRows(
    db,
    orderedIds.map((id) => idFromString(id)),
  )
  const countOf = await categoryPostCounter(db)
  return Promise.all(updated.map(async (row) => toAdminCategoryDto(row, await countOf(row.name))))
}

export async function deleteAdminCategory(db: NodePgDatabase, id: bigint): Promise<boolean> {
  return deleteAdminTaxonomy(id, '分类', {
    findById: (id) => findCategoryById(db, id),
    deleteRow: (id) => deleteCategoryRow(db, id),
    listPostsBy: (name) => listPostsByCategory(db, name),
  })
}
