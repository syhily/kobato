import type { Database } from '@kobato/db/database.ts'
import type { EntityType } from '@kobato/db/target.ts'

import { page } from '@kobato/db/schema/page.ts'
import { post } from '@kobato/db/schema/post.ts'
import { eq, inArray } from 'drizzle-orm'

export interface EntitySlugTitle {
  type: EntityType
  slug: string
  title: string
}

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
