import type { ClientPost } from '@kobato/catalog/model'
import type { PostMetaRow } from '@kobato/db/sqlite/types'

import { readStringArray } from '@kobato/server/infra/coerce'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters'
import { brandingVersionSuffix } from '@kobato/settings/presentation'

export type PostMetaWithAuthor = PostMetaRow & { authorName: string | null }

function defaultOpenGraphSuffix(): string {
  return brandingVersionSuffix(getBlogSettingsBundleSync()?.assets?.branding?.openGraph)
}

export function toClientPostFromMeta(meta: PostMetaRow, tags: string[] = [], categoryName = ''): ClientPost {
  const date = meta.firstPublishedAt ?? meta.publishedAt
  return {
    id: String(meta.id),
    title: meta.title,
    date,
    updated: meta.publishedAt,
    comments: meta.commentsEnabled,
    alias: readStringArray(meta.alias),
    tags,
    category: categoryName,
    summary: meta.summary,
    cover: meta.cover || `/images/open-graph.png${defaultOpenGraphSuffix()}`,
    og: meta.og ?? undefined,
    published: meta.published,
    visible: meta.visible,
    toc: meta.showToc,
    showUpdated: meta.showUpdated,
    contentLanguage: meta.contentLanguage,
    slug: meta.slug,
    permalink: `/posts/${meta.slug}`,
    headings: [],
    pinnedAt: meta.pinnedAt ?? undefined,
  }
}
