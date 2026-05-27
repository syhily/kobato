import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { PendingCommentRow } from '@/server/domains/comments/repos/shared'
import type { LatestComment } from '@/server/domains/comments/types'
import type { MetricRow } from '@/server/infra/db/types'

import { ensureMetric, findMetricByPublicId } from '@/server/infra/db/operations/metric'
import { DomainError } from '@/server/infra/http/errors'
import { requireBlogSettingsSection } from '@/shared/config/getters'

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
