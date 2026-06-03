import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { eq } from 'drizzle-orm'

import type { PendingCommentRow } from '@/server/domains/comments/repos/shared'
import type { LatestComment } from '@/server/domains/comments/types'
import type { MetricRow } from '@/server/infra/db/types'

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

export async function resolveMetricTarget(db: NodePgDatabase, key: string): Promise<MetricTarget> {
  const row = await findMetricByPublicId(db, key)
  if (row === null || row.type === null || row.ownerId === null) {
    throw new DomainError('NOT_FOUND', '评论目标不存在')
  }
  if (row.type !== 'post' && row.type !== 'page') {
    throw new DomainError('BAD_REQUEST', '无效的评论目标类型')
  }
  return { type: row.type, ownerId: row.ownerId }
}

export async function safeResolveMetricTarget(db: NodePgDatabase, key: string): Promise<MetricTarget | null> {
  const row = await findMetricByPublicId(db, key)
  if (row === null || row.type === null || row.ownerId === null) {
    return null
  }
  if (row.type !== 'post' && row.type !== 'page') {
    return null
  }
  return { type: row.type, ownerId: row.ownerId }
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

/** Narrow a database `type` column to the entity types that comments can
 *  attach to. Throws if the value is neither `'post'` nor `'page'`;
 *  returns `null` when either argument is null (caller decides how to
 *  handle). Centralises the check so call sites don't need `as` casts. */
export function asCommentTarget(
  type: string | null,
  ownerId: bigint | null,
): { type: 'post' | 'page'; ownerId: bigint } | null {
  if (type === null || ownerId === null) {
    return null
  }
  if (type !== 'post' && type !== 'page') {
    return null
  }
  return { type, ownerId }
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
