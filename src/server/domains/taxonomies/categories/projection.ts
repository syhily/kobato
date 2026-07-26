import type { CategoryRow } from '@/server/infra/db/types'
import type { AdminCategoryDto } from '@/shared/contracts/categories'

export function toAdminCategoryDto(row: CategoryRow, postCount: number): AdminCategoryDto {
  return {
    id: String(row.id),
    name: row.name,
    slug: row.slug,
    cover: row.cover,
    og: row.og ?? null,
    description: row.description,
    sortOrder: row.sortOrder,
    postCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export interface AdminCategoriesListResult {
  categories: AdminCategoryDto[]
  total: number
}

export interface UpsertCategoryInputs {
  id?: bigint
  name: string
  slug?: string
  cover: string
  og?: string
  description: string
  sortOrder?: number
}
