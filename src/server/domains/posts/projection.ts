import type { ContentRow, PostMetaRow } from '@/server/infra/db/types'
import type { AdminRevisionDto } from '@/shared/contracts/revision'
import type { Post } from '@/shared/types/catalog'

import { toAdminMetaDto, type AdminMetaDto } from '@/server/domains/content/entities/projection'
import { readRevisionProjection } from '@/server/domains/content/projection-helpers'
import { toClientPostFromMeta } from '@/server/domains/posts/repos/shared'
import { readStringArray } from '@/shared/utils/tools'

// `toCmsPost` returns the shared `Post` DTO directly — no server-side variant.
export function toCmsPost(
  meta: PostMetaRow,
  publishedRevision: ContentRow | null,
  options: {
    coverThumbhash?: string
    coverWidth?: number
    coverHeight?: number
    tags?: string[]
    categoryName?: string
  } = {},
): Post {
  const { body, imageSources, headings } = readRevisionProjection(publishedRevision)

  // Compose from `toClientPostFromMeta`; only revision-joined fields are
  // stated here — `headings` overrides the projection's empty default.
  return {
    ...toClientPostFromMeta(meta, options.tags ?? [], options.categoryName ?? ''),
    coverThumbhash: options.coverThumbhash,
    headings,
    body,
    imageSources,
    publishedRevisionId: meta.publishedRevisionId,
  }
}

export interface AdminPostDto extends AdminMetaDto {
  visible: boolean
  category: string
  categoryId: string | null
  tags: string[]
  alias: string[]
  pinnedAt: string | null
  /** Null until the first successful publish. */
  firstPublishedAt: string | null
}

export function toAdminPostDto(
  row: PostMetaRow & { authorName?: string | null },
  options: { commentCount?: number; commentPublicId?: string; tags?: string[]; categoryName?: string } = {},
): AdminPostDto {
  return {
    ...toAdminMetaDto(row, options),
    visible: row.visible,
    category: options.categoryName ?? '',
    categoryId: row.categoryId === null ? null : String(row.categoryId),
    tags: options.tags ?? [],
    alias: readStringArray(row.alias),
    pinnedAt: row.pinnedAt === null ? null : row.pinnedAt.toISOString(),
    firstPublishedAt: row.firstPublishedAt === null ? null : row.firstPublishedAt.toISOString(),
  }
}

export interface AdminPostDetailDto {
  post: AdminPostDto
  latestRevision: AdminRevisionDto | null
  publishedRevision: AdminRevisionDto | null
}
