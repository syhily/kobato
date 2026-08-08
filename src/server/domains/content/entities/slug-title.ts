import { eq, inArray } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { EntityType } from '@/server/infra/db/target'

import { page } from '@/server/infra/db/schema/page'
import { post } from '@/server/infra/db/schema/post'

export interface EntitySlugTitle {
  type: EntityType
  slug: string
  title: string
}

/**
 * Look up the live `(slug, title)` of an entity target. Returns `null`
 * when the entity is hard-deleted or the target is an orphan.
 */
export async function findEntitySlugTitle(
  db: Database,
  target: { type: 'post' | 'page'; ownerId: number },
): Promise<{ slug: string; title: string } | null> {
  if (target.type === 'post') {
    const rows = await db
      .select({ slug: post.slug, title: post.title })
      .from(post)
      .where(eq(post.id, target.ownerId))
      .limit(1)
    return rows[0] ?? null
  }
  const rows = await db
    .select({ slug: page.slug, title: page.title })
    .from(page)
    .where(eq(page.id, target.ownerId))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Batch-resolve the `(slug, title)` of a comment list's targets. Map
 * keyed by `type:ownerId`; orphan pairs are absent.
 */
export async function resolveEntitiesForComments(
  db: Database,
  pairs: ReadonlyArray<{ type: EntityType; ownerId: number }>,
): Promise<Map<string, EntitySlugTitle>> {
  const out = new Map<string, EntitySlugTitle>()
  if (pairs.length === 0) {
    return out
  }
  const postIds: number[] = []
  const pageIds: number[] = []
  const seen = new Set<string>()
  for (const p of pairs) {
    const key = `${p.type}:${p.ownerId}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    if (p.type === 'post') {
      postIds.push(p.ownerId)
    } else if (p.type === 'page') {
      pageIds.push(p.ownerId)
    }
  }
  if (postIds.length > 0) {
    const rows = await db
      .select({ id: post.id, slug: post.slug, title: post.title })
      .from(post)
      .where(inArray(post.id, postIds))
    for (const r of rows) {
      out.set(`post:${r.id}`, { type: 'post', slug: r.slug, title: r.title })
    }
  }
  if (pageIds.length > 0) {
    const rows = await db
      .select({ id: page.id, slug: page.slug, title: page.title })
      .from(page)
      .where(inArray(page.id, pageIds))
    for (const r of rows) {
      out.set(`page:${r.id}`, { type: 'page', slug: r.slug, title: r.title })
    }
  }
  return out
}
