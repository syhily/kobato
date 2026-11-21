import type {
  AdminWebmentionOutboxWire,
  AdminWebmentionWire,
  PublicWebmentionWire,
  WebmentionOutboxStatusCounts,
  WebmentionStatusCounts,
} from '@kobato/api/contracts/webmentions'
import type { Database } from '@kobato/db/database'
import type { WebmentionOutboxStatus, WebmentionStatus } from '@kobato/db/schema/webmention'
import type { EntityTarget } from '@kobato/db/target'

import {
  countWebmentions,
  countWebmentionsByStatus,
  findWebmentionById,
  listApprovedWebmentionsForTarget,
  listWebmentionsByStatus,
  setWebmentionStatus,
} from '@kobato/db/operations/webmention'
import { countWebmentionOutboxByStatus, listWebmentionOutboxForAdmin } from '@kobato/db/operations/webmention-outbox'
import { page } from '@kobato/db/schema/page'
import { post } from '@kobato/db/schema/post'
import {
  asAdminWebmentionOutboxListWire,
  asAdminWebmentionsWire,
  asPublicWebmentionsWire,
} from '@kobato/server/domains/webmentions/projection'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'
import { requireBlogSettingsSection } from '@kobato/settings/getters'
import { idFromString } from '@kobato/utils/id'
import { eq } from 'drizzle-orm'

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

async function isEntityWebmentionsEnabled(db: Database, target: EntityTarget): Promise<boolean> {
  if (target.type === 'post') {
    const rows = await db
      .select({ enabled: post.webmentionsEnabled })
      .from(post)
      .where(eq(post.id, target.ownerId))
      .limit(1)
    return rows[0]?.enabled ?? false
  }
  const rows = await db
    .select({ enabled: page.webmentionsEnabled })
    .from(page)
    .where(eq(page.id, target.ownerId))
    .limit(1)
  return rows[0]?.enabled ?? false
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
