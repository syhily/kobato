import type { PostMetaDraft, UpsertPostMetaInput } from '@/shared/types/posts'

export function buildPostUpsertPayload({
  meta,
  id,
  publishedAt,
}: {
  meta: PostMetaDraft
  id?: string
  /** ISO to set; `null` = cancel schedule; `undefined` = leave untouched. */
  publishedAt?: string | null
}): UpsertPostMetaInput {
  return {
    ...(id !== undefined ? { id } : {}),
    ...(meta.slug.trim() !== '' ? { slug: meta.slug.trim() } : {}),
    title: meta.title.trim(),
    summary: meta.summary.trim(),
    cover: meta.cover.trim(),
    og: meta.og.trim() === '' ? null : meta.og.trim(),
    commentsEnabled: meta.commentsEnabled,
    showToc: meta.showToc,
    showUpdated: meta.showUpdated,
    visible: meta.visible,
    pinnedAt: meta.pinned ? new Date().toISOString() : null,
    categoryId: meta.categoryId === '' ? null : meta.categoryId,
    tags: meta.tags,
    alias: meta.alias,
    ...(publishedAt !== undefined ? { publishedAt } : {}),
  }
}
