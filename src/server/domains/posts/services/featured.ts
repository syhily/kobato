import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { PostMetaRow } from '@/server/infra/db/types'
import type { SidebarSettings } from '@/shared/config/types'
import type { ClientPost, SidebarPostLink } from '@/shared/types/catalog'

import { livePostWhere } from '@/server/domains/posts/live-gate'
import { hydratePostImages, hydratePostList } from '@/server/domains/posts/repos/hydrate'
import { toClientPostFromMeta } from '@/server/domains/posts/repos/shared'
import { findCategoryNamesByIds } from '@/server/infra/db/operations/category'
import { findTagNamesByPostIds } from '@/server/infra/db/operations/post-tag'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { getSidebarWidgetCount } from '@/shared/config/utils'
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

/**
 * The pinned inputs every sidebar selector samples from.
 *
 * `seed` is built ONCE per request/representation by the orchestrator
 * (`http/loaders/sidebar-select::sidebarSelection`): entity/URL scope + the
 * site calendar date in the request's time zone + the settings revision. The
 * selectors themselves never read the settings snapshot.
 */
export interface SidebarSelection {
  /** Request-pinned `blog.sidebar` section — never the global snapshot. */
  settings: SidebarSettings
  seed: string
}

export async function selectSidebarPosts(db: Database, selection: SidebarSelection): Promise<SidebarPostLink[]> {
  const count = getSidebarWidgetCount(selection.settings, 'recentPosts')
  if (count <= 0) {
    return []
  }
  const where = and(livePostWhere(), eq(postMetaTable.visible, true))
  // Read candidate ids once (stable id order), pick distinct positions with the
  // SEEDED shuffle, then fetch via one IN query. The seed rotates per site
  // calendar day / scope / settings revision, so repeated renders of the same
  // representation pick the same posts — the detail ETag stays stable — while
  // the widget keeps its "random" flavor.
  const idRows = await db
    .select({ id: postMetaTable.id })
    .from(postMetaTable)
    .where(where)
    .orderBy(asc(postMetaTable.id))
  if (idRows.length === 0) {
    return []
  }
  const candidateIds = idRows.map((row) => row.id)
  const picked = shuffle(candidateIds, `${selection.seed}|posts|${candidateIds.length}`).slice(0, count)
  const metas = await db.select().from(postMetaTable).where(inArray(postMetaTable.id, picked))
  // Preserve the seeded pick order — the payload (and its ETag) must not depend
  // on the DB's incidental row order.
  const metaById = new Map(metas.map((meta) => [meta.id, meta]))
  const ordered = picked.flatMap((id) => {
    const meta = metaById.get(id)
    return meta === undefined ? [] : [meta]
  })
  const posts = await hydratePostList(db, ordered, { images: false })
  return posts.map(toSidebarPostLink)
}
