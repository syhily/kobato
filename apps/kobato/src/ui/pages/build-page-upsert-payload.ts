import type { UpsertPageMetaInput } from '@kobato/api/contracts/admin/pages'

import { isContentLanguageInput } from '@kobato/i18n/content-language'

import type { PageMetaDraft } from '@/ui/pages/page-meta'

export function buildPageUpsertPayload({
  meta,
  id,
  publishedAt,
}: {
  meta: PageMetaDraft
  id?: string
  publishedAt?: string | null
}): UpsertPageMetaInput {
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
