import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { randomInt } from 'node:crypto'

import type { Database } from '@/server/infra/db/database'
import type { PostMetaRow } from '@/server/infra/db/types'
import type { ClientPost, SidebarPostLink } from '@/shared/types/catalog'

import { livePostWhere } from '@/server/domains/posts/live-gate'
import { hydratePostImages, hydratePostList } from '@/server/domains/posts/repos/hydrate'
import { toClientPostFromMeta } from '@/server/domains/posts/repos/shared'
import { findCategoryNamesByIds } from '@/server/infra/db/operations/category'
import { findTagNamesByPostIds } from '@/server/infra/db/operations/post-tag'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { toSidebarPostLink } from '@/shared/types/catalog'
import { shuffle } from '@/shared/utils/tools'

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
  const publicWhere = and(livePostWhere({ asOf: now }), eq(postMetaTable.visible, true))

  const pinnedMetas = await db
    .select()
    .from(postMetaTable)
    .where(and(publicWhere, isNotNull(postMetaTable.pinnedAt)))
    .orderBy(desc(postMetaTable.pinnedAt))
    .limit(FEATURE_POST_COUNT)

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

  const [recentMetas, allWithCover] = await Promise.all([
    db
      .select({ id: postMetaTable.id })
      .from(postMetaTable)
      .where(publicWhere)
      .orderBy(desc(postMetaTable.firstPublishedAt))
      .limit(recentWindow),
    db
      .select()
      .from(postMetaTable)
      .where(and(publicWhere, sql`${postMetaTable.cover} <> ''`))
      .orderBy(desc(postMetaTable.firstPublishedAt))
      .limit(100),
  ])

  const recentIds = new Set(recentMetas.map((r) => r.id))
  const pinnedSlugs = new Set(pinnedMetas.map((m) => m.slug))
  const candidateMetas = allWithCover.filter((m) => !pinnedSlugs.has(m.slug) && !recentIds.has(m.id))
  // One name batch for the union of pinned + candidate rows.
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

export async function selectSidebarPosts(db: Database, count: number): Promise<SidebarPostLink[]> {
  if (count <= 0) {
    return []
  }
  const where = and(livePostWhere(), eq(postMetaTable.visible, true))
  // Read candidate ids once, pick distinct random positions in JS, fetch via
  // one IN query; the pick uses a fresh CSPRNG draw each call.
  const idRows = await db
    .select({ id: postMetaTable.id })
    .from(postMetaTable)
    .where(where)
    // A stable key so position addressing is deterministic per pick.
    .orderBy(asc(postMetaTable.id))
  if (idRows.length === 0) {
    return []
  }
  const pick = Math.min(count, idRows.length)
  const positions = new Set<number>()
  while (positions.size < pick) {
    positions.add(randomInt(idRows.length))
  }
  const metas = await db
    .select()
    .from(postMetaTable)
    .where(
      inArray(
        postMetaTable.id,
        [...positions].map((position) => idRows[position]!.id),
      ),
    )
  const posts = await hydratePostList(db, metas, { images: false })
  return posts.map(toSidebarPostLink)
}
