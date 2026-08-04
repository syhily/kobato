import type { PageMetaDraft, UpsertPageMetaInput } from '@kobato/shared/types/pages'

export function buildPageUpsertPayload({
  meta,
  id,
  publishedAt,
}: {
  meta: PageMetaDraft
  id?: string
  /** ISO to set; `null` = cancel schedule; `undefined` = leave untouched. */
  publishedAt?: string | null
}): UpsertPageMetaInput {
  return {
    ...(id !== undefined ? { id } : {}),
    ...(meta.slug.trim() !== '' ? { slug: meta.slug.trim() } : {}),
    title: meta.title.trim(),
    summary: meta.summary.trim(),
    cover: meta.cover.trim(),
    og: meta.og.trim() === '' ? null : meta.og.trim(),
    commentsEnabled: meta.commentsEnabled,
    webmentionsEnabled: meta.webmentionsEnabled,
    showToc: meta.showToc,
    showUpdated: meta.showUpdated,
    showFriends: meta.showFriends,
    ...(publishedAt !== undefined ? { publishedAt } : {}),
  }
}
