import type { UpsertPostMetaInput } from '@kobato/contracts/posts.ts'
import type { PostMetaDraft } from '@kobato/web-admin/ui/posts/post-meta.ts'

import { isContentLanguageInput } from '@kobato/i18n/content-language.ts'

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
    // The category <Select> yields the numeric id as a string; the wire takes the number.
    categoryId: meta.categoryId === '' ? null : Number(meta.categoryId),
    tags: meta.tags,
    alias: meta.alias,
    ...(publishedAt !== undefined ? { publishedAt } : {}),
  }
}
