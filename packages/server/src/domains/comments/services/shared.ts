import type { Database } from '@kobato/db/sqlite/database'
import type { MetricRow } from '@kobato/db/sqlite/types'

import { ensureMetric, findMetricByPublicId } from '@kobato/db/sqlite/operations/system/metric'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'

export interface MetricTarget {
  type: 'post' | 'page'
  ownerId: number
}

export function asCommentTarget(type: string | null, ownerId: number | null): MetricTarget | null {
  if (type === null || ownerId === null) {
    return null
  }
  if (type !== 'post' && type !== 'page') {
    return null
  }
  return { type, ownerId }
}

export async function resolveMetricTarget(db: Database, key: string): Promise<MetricTarget> {
  const row = await findMetricByPublicId(db, key)
  if (row?.type == null || row.ownerId == null) {
    throw new DomainError('NOT_FOUND', descriptorFor('comments.error.targetMissing'))
  }
  const target = asCommentTarget(row.type, row.ownerId)
  if (target === null) {
    throw new DomainError('BAD_REQUEST', descriptorFor('comments.error.targetTypeInvalid'))
  }
  return target
}

export async function safeResolveMetricTarget(db: Database, key: string): Promise<MetricTarget | null> {
  const row = await findMetricByPublicId(db, key)
  if (row === null) {
    return null
  }
  return asCommentTarget(row.type, row.ownerId)
}

export async function ensureCommentPage(
  db: Database,
  target: { type: 'post' | 'page'; ownerId: number },
): Promise<MetricRow> {
  return ensureMetric(db, target)
}
