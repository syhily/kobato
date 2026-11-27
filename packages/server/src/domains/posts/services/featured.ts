import type { ClientPost, SidebarPostLink } from '@kobato/catalog/model'
import type { Database } from '@kobato/db/sqlite/database'
import type { PostMetaRow } from '@kobato/db/sqlite/types'
import type { SidebarSettings } from '@kobato/settings/types'

import { shuffle } from '@kobato/base/utils/sampling'
import { toSidebarPostLink } from '@kobato/catalog/projection'
import {
  listLiveVisiblePostIds,
  listLiveVisiblePostMetasWithCover,
  listPinnedLiveVisiblePostMetas,
  listPostMetasByIds,
  listVisibleLivePostIdsOrderedById,
} from '@kobato/db/sqlite/operations/content/post-feature'
import { findCategoryNamesByIds } from '@kobato/db/sqlite/operations/taxonomy/category'
import { findTagNamesByPostIds } from '@kobato/db/sqlite/operations/taxonomy/tag'
import { hydratePostImages, hydratePostList } from '@kobato/server/domains/posts/repos/hydrate'
import { toClientPostFromMeta } from '@kobato/server/domains/posts/repos/shared'
import { requireBlogSettingsSection } from '@kobato/settings/getters'
import { getSidebarWidgetCount } from '@kobato/settings/presentation'

const FEATURE_POST_COUNT = 3

function categoryIdsOf(metas: readonly PostMetaRow[]): number[] {
  return metas.map((m) => m.categoryId).filter((id): id is number => id !== null)
}

export async function selectFeaturePosts(db: Database, seed: string): Promise<ClientPost[]> {
  const content = requireBlogSettingsSection('content')
  if (!content.post.featureEnabled) {
    return []
  }

  const now = new Date()

  const pinnedMetas = await listPinnedLiveVisiblePostMetas(db, FEATURE_POST_COUNT, now)

  if (pinnedMetas.length === FEATURE_POST_COUNT) {
    const [pinnedTagMap, pinnedCategoryMap] = await Promise.all([
      findTagNamesByPostIds(
        db,
        pinnedMetas.map((m) => m.id),
      ),
      findCategoryNamesByIds(db, categoryIdsOf(pinnedMetas)),
    ])
    const pinned = pinnedMetas.map((meta) =>
      toClientPostFromMeta(meta, pinnedTagMap.get(meta.id) ?? [], pinnedCategoryMap.get(meta.categoryId ?? -1) ?? ''),
    )
    await hydratePostImages(db, pinned)
    return pinned
  }

  const pageSize = content.pagination.posts
  const recentWindow = pageSize * 2

  const [recentIds, allWithCover] = await Promise.all([
    listLiveVisiblePostIds(db, recentWindow, now),
    listLiveVisiblePostMetasWithCover(db, 100, now),
  ])

  const recentIdSet = new Set(recentIds)
  const pinnedSlugs = new Set(pinnedMetas.map((m) => m.slug))
  const candidateMetas = allWithCover.filter((m) => !pinnedSlugs.has(m.slug) && !recentIdSet.has(m.id))
  const [pinnedTagMap, candidateTagMap, categoryMap] = await Promise.all([
    findTagNamesByPostIds(
      db,
      pinnedMetas.map((m) => m.id),
    ),
    findTagNamesByPostIds(
      db,
      candidateMetas.map((m) => m.id),
    ),
    findCategoryNamesByIds(db, categoryIdsOf([...pinnedMetas, ...candidateMetas])),
  ])
  const categoryNameOf = (id: number | null): string => categoryMap.get(id ?? -1) ?? ''
  const pinned = pinnedMetas.map((meta) =>
    toClientPostFromMeta(meta, pinnedTagMap.get(meta.id) ?? [], categoryNameOf(meta.categoryId)),
  )
  const candidates = candidateMetas.map((meta) =>
    toClientPostFromMeta(meta, candidateTagMap.get(meta.id) ?? [], categoryNameOf(meta.categoryId)),
  )

  const withCover = candidates.filter((post) => post.cover)
  const pool = withCover.length >= FEATURE_POST_COUNT - pinned.length ? withCover : candidates

  let result: ClientPost[]
  if (pool.length + pinned.length < FEATURE_POST_COUNT) {
    const fallbackPool = candidates
    result = [...pinned, ...fallbackPool].slice(0, FEATURE_POST_COUNT)
  } else {
    const shuffled = shuffle(pool, `feature-posts:${seed}:${pool.length}`)
    result = [...pinned, ...shuffled.slice(0, FEATURE_POST_COUNT - pinned.length)]
  }

  await hydratePostImages(db, result)
  return result
}

export interface SidebarSelection {
  settings: SidebarSettings
  seed: string
}

export async function selectSidebarPosts(db: Database, selection: SidebarSelection): Promise<SidebarPostLink[]> {
  const count = getSidebarWidgetCount(selection.settings, 'recentPosts')
  if (count <= 0) {
    return []
  }
  const candidateIds = await listVisibleLivePostIdsOrderedById(db)
  if (candidateIds.length === 0) {
    return []
  }
  const picked = shuffle(candidateIds, `${selection.seed}|posts|${candidateIds.length}`).slice(0, count)
  const metas = await listPostMetasByIds(db, picked)
  const metaById = new Map(metas.map((meta) => [meta.id, meta]))
  const ordered = picked.flatMap((id) => {
    const meta = metaById.get(id)
    return meta === undefined ? [] : [meta]
  })
  const posts = await hydratePostList(db, ordered, { images: false })
  return posts.map(toSidebarPostLink)
}
