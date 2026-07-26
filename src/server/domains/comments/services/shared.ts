import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { eq, inArray } from 'drizzle-orm'

import type { EntitySlugTitle, PendingCommentRow } from '@/server/domains/comments/repos/shared'
import type { EntityType } from '@/server/infra/db/target'
import type { MetricRow } from '@/server/infra/db/types'
import type { LatestComment } from '@/shared/types/comments'

import { ensureMetric, findMetricByPublicId } from '@/server/infra/db/operations/metric'
import { page } from '@/server/infra/db/schema/page'
import { post } from '@/server/infra/db/schema/post'
import { DomainError } from '@/server/infra/http/errors'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { joinUrl } from '@/shared/utils/urls'

export interface MetricTarget {
  type: 'post' | 'page'
  ownerId: bigint
}

/** Narrow a database `type` column to the entity types that comments can
 *  attach to. Returns `null` when either argument is null or the type is
 *  neither `'post'` nor `'page'` (caller decides how to handle).
 *  Centralises the check so call sites don't need `as` casts — the
 *  throwing wrapper is `resolveMetricTarget`. */
export function asCommentTarget(type: string | null, ownerId: bigint | null): MetricTarget | null {
  if (type === null || ownerId === null) {
    return null
  }
  if (type !== 'post' && type !== 'page') {
    return null
  }
  return { type, ownerId }
}

export async function resolveMetricTarget(db: NodePgDatabase, key: string): Promise<MetricTarget> {
  const row = await findMetricByPublicId(db, key)
  if (row === null || row.type === null || row.ownerId === null) {
    throw new DomainError('NOT_FOUND', '评论目标不存在')
  }
  const target = asCommentTarget(row.type, row.ownerId)
  if (target === null) {
    throw new DomainError('BAD_REQUEST', '无效的评论目标类型')
  }
  return target
}

export async function safeResolveMetricTarget(db: NodePgDatabase, key: string): Promise<MetricTarget | null> {
  const row = await findMetricByPublicId(db, key)
  if (row === null) {
    return null
  }
  return asCommentTarget(row.type, row.ownerId)
}

export function trimSiteSuffix(title: string | null): string {
  let trim = title ?? ''
  const siteTitle = requireBlogSettingsSection('siteIdentity').title
  if (trim.includes(` - ${siteTitle}`)) {
    trim = trim.substring(0, trim.indexOf(` - ${siteTitle}`))
  }
  return trim
}

export function entityPermalink(type: 'post' | 'page', slug: string): string {
  return type === 'post' ? `/posts/${slug}` : `/${slug}`
}

export function toLatestComment(row: PendingCommentRow): LatestComment {
  const slug = row.slug ?? ''
  const path = slug === '' ? '/' : `${entityPermalink(row.type, slug)}/`
  return {
    title: trimSiteSuffix(row.title),
    author: row.author ?? '',
    authorLink: row.authorLink ?? '',
    permalink: `${path}#user-comment-${row.id}`,
  }
}

export async function ensureCommentPage(
  db: NodePgDatabase,
  target: { type: 'post' | 'page'; ownerId: bigint },
): Promise<MetricRow> {
  return ensureMetric(db, target)
}

/**
 * Fully-qualified URL with trailing slash — the shape comment / metric
 * rows used to store as the URL `page_key`. Used at email-send time so
 * notification permalinks always reflect the current `siteIdentity.website`
 * and the current canonical slug.
 */
export function entityCommentUrl(type: 'post' | 'page', slug: string): string {
  const website = requireBlogSettingsSection('siteIdentity').website
  return joinUrl(website, entityPermalink(type, slug), '/')
}

/**
 * Look up the live `(slug, title)` of an entity target. Used by the
 * email senders and the comment-form loader, both of which need the
 * current values rather than the stale denormalised snapshot the
 * metric table used to carry. Returns `null` when the entity has been
 * hard-deleted or the target points at nothing (orphan).
 */
export async function findEntitySlugTitle(
  db: NodePgDatabase,
  target: { type: 'post' | 'page'; ownerId: bigint },
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
 * Batch-resolve the `(slug, title)` of the entities a list of comments
 * attaches to — the multi-target counterpart of {@link findEntitySlugTitle}.
 * Returns a map keyed by `type:ownerId`; pairs pointing at nothing
 * (orphan rows) are absent.
 */
export async function resolveEntitiesForComments(
  db: NodePgDatabase,
  pairs: ReadonlyArray<{ type: EntityType; ownerId: bigint }>,
): Promise<Map<string, EntitySlugTitle>> {
  const out = new Map<string, EntitySlugTitle>()
  if (pairs.length === 0) {
    return out
  }
  const postIds: bigint[] = []
  const pageIds: bigint[] = []
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
