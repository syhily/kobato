import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'

import type { ClientPost, SidebarPostLink } from '@/shared/types/catalog'

import { hydrateClientPostCovers } from '@/server/domains/posts/repos/hydrate'
import { toClientPostFromMeta } from '@/server/domains/posts/repos/shared'
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
  const publicWhere = and(
    isNull(postMetaTable.deletedAt),
    eq(postMetaTable.published, true),
    isNotNull(postMetaTable.publishedRevisionId),
    eq(postMetaTable.visible, true),
    sql`${postMetaTable.publishedAt} <= ${now}`,
  )

  const pinnedMetas = await db
    .select()
    .from(postMetaTable)
    .where(and(publicWhere, isNotNull(postMetaTable.pinnedAt)))
    .orderBy(desc(postMetaTable.pinnedAt))
    .limit(FEATURE_POST_COUNT)

  const pinned = pinnedMetas.map((meta) => toClientPostFromMeta(meta))
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
  const candidates = allWithCover
    .filter((m) => !pinnedSlugs.has(m.slug) && !recentIds.has(m.id))
    .map((meta) => toClientPostFromMeta(meta))

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

// Cached seed for sidebar post randomisation. Rotated every 5 minutes so
// the sidebar refreshes periodically without requiring a full `ORDER BY
// random()` (which forces a sort of the entire result set).
let sidebarSeed: string | undefined
let sidebarSeedAt = 0
const SIDEBAR_SEED_TTL_MS = 5 * 60 * 1000

function getSidebarSeed(): string {
  const now = Date.now()
  if (sidebarSeed === undefined || now - sidebarSeedAt > SIDEBAR_SEED_TTL_MS) {
    sidebarSeed = String(now)
    sidebarSeedAt = now
  }
  return sidebarSeed
}

export async function selectSidebarPosts(db: NodePgDatabase, count: number): Promise<SidebarPostLink[]> {
  if (count <= 0) {
    return []
  }
  const metas = await db
    .select()
    .from(postMetaTable)
    .where(
      and(
        isNull(postMetaTable.deletedAt),
        eq(postMetaTable.published, true),
        isNotNull(postMetaTable.publishedRevisionId),
        eq(postMetaTable.visible, true),
        sql`${postMetaTable.publishedAt} <= ${new Date()}`,
      ),
    )
    .orderBy(sql`md5(${postMetaTable.id}::text || ${getSidebarSeed()})`)
    .limit(count)
  return metas.map((meta) => toClientPostFromMeta(meta)).map(toSidebarPostLink)
}
