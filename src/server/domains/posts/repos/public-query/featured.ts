import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, desc, eq, isNotNull, sql } from 'drizzle-orm'

import type { ClientPost, SidebarPostLink } from '@/shared/types/catalog'

import { hydrateClientPostCovers } from '@/server/domains/posts/repos/hydrate'
import { livePostWhere, toClientPostFromMeta } from '@/server/domains/posts/repos/shared'
import { findTagNamesByPostIds } from '@/server/infra/db/operations/post-tag'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { toSidebarPostLink } from '@/shared/types/catalog'
import { shuffle } from '@/shared/utils/tools'

const FEATURE_POST_COUNT = 3

export async function selectFeaturePosts(db: NodePgDatabase, seed: string): Promise<ClientPost[]> {
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

  const pinnedTagMap = await findTagNamesByPostIds(
    db,
    pinnedMetas.map((m) => m.id),
  )
  const pinned = pinnedMetas.map((meta) => toClientPostFromMeta(meta, pinnedTagMap.get(meta.id) ?? []))
  if (pinned.length === FEATURE_POST_COUNT) {
    await hydrateClientPostCovers(db, pinned)
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
  const pinnedSlugs = new Set(pinned.map((p) => p.slug))
  const candidateIds = allWithCover.filter((m) => !pinnedSlugs.has(m.slug) && !recentIds.has(m.id)).map((m) => m.id)
  const candidateTagMap = await findTagNamesByPostIds(db, candidateIds)
  const candidates = allWithCover
    .filter((m) => !pinnedSlugs.has(m.slug) && !recentIds.has(m.id))
    .map((meta) => toClientPostFromMeta(meta, candidateTagMap.get(meta.id) ?? []))

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

  await hydrateClientPostCovers(db, result)
  return result
}

export async function selectSidebarPosts(db: NodePgDatabase, count: number): Promise<SidebarPostLink[]> {
  if (count <= 0) {
    return []
  }
  // Per-request seed so the sidebar randomises on every page load, matching
  // the tag-cloud behaviour. Avoids module-level shared state between SSR
  // requests while keeping the deterministic md5 ordering.
  const seed = `${Date.now()}:${Math.random()}`
  const metas = await db
    .select()
    .from(postMetaTable)
    .where(and(livePostWhere(), eq(postMetaTable.visible, true)))
    .orderBy(sql`md5(${postMetaTable.id}::text || ${seed})`)
    .limit(count)
  const tagMap = await findTagNamesByPostIds(
    db,
    metas.map((m) => m.id),
  )
  return metas.map((meta) => toClientPostFromMeta(meta, tagMap.get(meta.id) ?? [])).map(toSidebarPostLink)
}
