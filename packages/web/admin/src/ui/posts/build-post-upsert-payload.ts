import type { UpsertPostMetaInput } from '@kobato/api/contracts/admin/posts'
import type { PostMetaDraft } from '@kobato/web-admin/ui/posts/post-meta'

import { isContentLanguageInput } from '@kobato/i18n/content-language'

export function buildPostUpsertPayload({
  meta,
  id,
  publishedAt,
}: {
  meta: PostMetaDraft
  id?: string
  publishedAt?: string | null
}): UpsertPostMetaInput {
  const contentLanguage = meta.contentLanguage.trim()
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
    ...(isContentLanguageInput(contentLanguage)
      ? { contentLanguage: contentLanguage === '' ? null : contentLanguage }
      : {}),
    visible: meta.visible,
    pinnedAt: meta.pinned ? new Date().toISOString() : null,
    categoryId: meta.categoryId === '' ? null : Number(meta.categoryId),
    tags: meta.tags,
    alias: meta.alias,
    ...(publishedAt !== undefined ? { publishedAt } : {}),
  }
}
