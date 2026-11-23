import type {
  AdminWebmentionOutboxWire,
  AdminWebmentionWire,
  WebmentionOutboxStatusCounts,
  WebmentionStatusCounts,
} from '@kobato/api/contracts/admin/webmentions'
import type { PublicWebmentionWire } from '@kobato/api/contracts/public/webmentions'
import type { Database } from '@kobato/db/sqlite/database'
import type { WebmentionOutboxStatus, WebmentionStatus } from '@kobato/db/sqlite/schema/webmention'
import type { EntityTarget } from '@kobato/db/sqlite/target'

import {
  countWebmentions,
  countWebmentionsByStatus,
  findWebmentionById,
  listApprovedWebmentionsForTarget,
  listWebmentionsByStatus,
  setWebmentionStatus,
  isEntityWebmentionsEnabled,
} from '@kobato/db/sqlite/operations/engagement/webmention'
import {
  countWebmentionOutboxByStatus,
  listWebmentionOutboxForAdmin,
} from '@kobato/db/sqlite/operations/engagement/webmention-outbox'
import {
  asAdminWebmentionOutboxListWire,
  asAdminWebmentionsWire,
  asPublicWebmentionsWire,
} from '@kobato/server/domains/webmentions/projection'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'
import { requireBlogSettingsSection } from '@kobato/settings/getters'
import { idFromString } from '@kobato/utils/id'

export interface AdminWebmentionList {
  mentions: AdminWebmentionWire[]
  total: number
  hasMore: boolean
  statusCounts: WebmentionStatusCounts
}

export interface AdminWebmentionOutboxList {
  rows: AdminWebmentionOutboxWire[]
  total: number
  hasMore: boolean
  statusCounts: WebmentionOutboxStatusCounts
}

export async function listAdminWebmentions(
  db: Database,
  input: { offset: number; limit: number; status?: 'all' | WebmentionStatus },
): Promise<AdminWebmentionList> {
  const status = input.status === undefined || input.status === 'all' ? undefined : input.status
  const [rows, total, statusCounts] = await Promise.all([
    listWebmentionsByStatus(db, status, input.offset, input.limit),
    countWebmentions(db, status),
    countWebmentionsByStatus(db),
  ])
  return {
    mentions: asAdminWebmentionsWire(rows),
    total,
    hasMore: input.offset + rows.length < total,
    statusCounts,
  }
}

export async function listAdminWebmentionOutbox(
  db: Database,
  input: { offset: number; limit: number; status?: 'all' | WebmentionOutboxStatus },
): Promise<AdminWebmentionOutboxList> {
  const status = input.status === undefined || input.status === 'all' ? undefined : input.status
  const [rows, statusCounts] = await Promise.all([
    listWebmentionOutboxForAdmin(db, status, input.offset, input.limit),
    countWebmentionOutboxByStatus(db),
  ])
  const total = status === undefined ? statusCounts.all : statusCounts[status]
  return {
    rows: asAdminWebmentionOutboxListWire(rows),
    total,
    hasMore: input.offset + rows.length < total,
    statusCounts,
  }
}

export async function listPublicWebmentions(db: Database, target: EntityTarget): Promise<PublicWebmentionWire[]> {
  return asPublicWebmentionsWire(await listApprovedWebmentionsForTarget(db, target))
}

export async function loadPublicWebmentionsForTarget(
  db: Database,
  target: EntityTarget,
): Promise<PublicWebmentionWire[]> {
  if (!requireBlogSettingsSection('webmentions').webmention.displayOnPosts) {
    return []
  }
  if (!(await isEntityWebmentionsEnabled(db, target))) {
    return []
  }
  return listPublicWebmentions(db, target)
}

async function moderate(db: Database, id: string, status: WebmentionStatus): Promise<void> {
  const row = await findWebmentionById(db, idFromString(id))
  if (row === null) {
    throw new DomainError('NOT_FOUND', descriptorFor('webmentions.error.notFound'))
  }
  if (status === 'approved' && row.status === 'hidden') {
    throw new DomainError('BAD_REQUEST', descriptorFor('webmentions.error.hidden'))
  }
  await setWebmentionStatus(db, row.id, status)
}

export async function approveWebmention(db: Database, id: string): Promise<void> {
  await moderate(db, id, 'approved')
}

export async function rejectWebmention(db: Database, id: string): Promise<void> {
  await moderate(db, id, 'rejected')
}
