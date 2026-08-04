import type { Database } from '@kobato/server/infra/db/database'
import type { PostMetaRow } from '@kobato/server/infra/db/types'
import type { ClientPost, SidebarPostLink } from '@kobato/shared/types/catalog'

import { livePostWhere } from '@kobato/server/domains/posts/live-gate'
import { hydratePostImages, hydratePostList } from '@kobato/server/domains/posts/repos/hydrate'
import { toClientPostFromMeta } from '@kobato/server/domains/posts/repos/shared'
import { findCategoryNamesByIds } from '@kobato/server/infra/db/operations/category'
import { findTagNamesByPostIds } from '@kobato/server/infra/db/operations/post-tag'
import { post as postMetaTable } from '@kobato/server/infra/db/schema/post'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters'
import { toSidebarPostLink } from '@kobato/shared/types/catalog'
import { shuffle } from '@kobato/shared/utils/tools'
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { randomInt } from 'node:crypto'

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
  // One name batch for the union of pinned + candidate rows — the same
  // seam `hydratePostList` mounts for every other public listing.
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
  // The previous ORDER BY (id*seed) expression sort evaluated and ordered
  // the whole table per request, and the `Date.now():Math.random()` seed
  // string silently degraded to a millisecond timestamp under SQLite's
  // numeric-prefix parsing. Instead: read the candidate ids once (one
  // cheap indexed column scan), pick distinct random positions in JS —
  // uniform per request, no repeats — then fetch exactly those rows with
  // one key-based IN query. The sidebar randomises on every load, so the
  // pick deliberately uses a fresh CSPRNG draw each call.
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
