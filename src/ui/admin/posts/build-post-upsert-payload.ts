import type { PostMetaDraft, UpsertPostMetaInput } from '@/shared/types/posts'

import { isContentLanguageInput } from '@/shared/i18n/content-language'

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
  // An unparseable tag is never sent: the server would reject the whole save
  // (including an unrelated body/meta edit) and the field already shows the inline error.
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
    categoryId: meta.categoryId === '' ? null : meta.categoryId,
    tags: meta.tags,
    alias: meta.alias,
    ...(publishedAt !== undefined ? { publishedAt } : {}),
  }
}
