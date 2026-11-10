import type { PageMetaDraft, UpsertPageMetaInput } from '@/shared/types/pages'

import { isContentLanguageInput } from '@/shared/i18n/content-language'

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
    showFriends: meta.showFriends,
    ...(publishedAt !== undefined ? { publishedAt } : {}),
  }
}
