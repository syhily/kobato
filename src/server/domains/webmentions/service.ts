import { eq } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { WebmentionStatus } from '@/server/infra/db/operations/webmention'
import type { EntityTarget } from '@/server/infra/db/target'
import type {
  AdminWebmentionOutboxWire,
  AdminWebmentionWire,
  PublicWebmentionWire,
  WebmentionOutboxStatusCounts,
  WebmentionStatusCounts,
} from '@/shared/contracts/webmentions'

import {
  asAdminWebmentionOutboxListWire,
  asAdminWebmentionsWire,
  asPublicWebmentionsWire,
} from '@/server/domains/webmentions/projection'
import {
  countWebmentions,
  countWebmentionsByStatus,
  findWebmentionById,
  listApprovedWebmentionsForTarget,
  listWebmentionsByStatus,
  setWebmentionStatus,
} from '@/server/infra/db/operations/webmention'
import {
  countWebmentionOutboxByStatus,
  listWebmentionOutboxForAdmin,
} from '@/server/infra/db/operations/webmention-outbox'
import { page } from '@/server/infra/db/schema/page'
import { post } from '@/server/infra/db/schema/post'
import { DomainError } from '@/server/infra/http/errors'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import { idFromString } from '@/shared/utils/id'

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
  input: { offset: number; limit: number; status?: 'all' | 'pending' | 'approved' | 'rejected' | 'hidden' },
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

// Outbound send log — read-only: a retry is a republish, not an admin mutation.
export async function listAdminWebmentionOutbox(
  db: Database,
  input: { offset: number; limit: number; status?: 'all' | 'pending' | 'sent' | 'no-endpoint' | 'failed' },
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

/** Public display feed — approved mentions only (DTO contract in shared/contracts). */
export async function listPublicWebmentions(db: Database, target: EntityTarget): Promise<PublicWebmentionWire[]> {
  return asPublicWebmentionsWire(await listApprovedWebmentionsForTarget(db, target))
}

/** Per-entity display switch: one PK read; a missing row answers false.
 *  Single gate shared by the detail loader and `public.webmention.list`. */
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

/** Public feed with both switches applied (global + per-entity), each to an
 *  honest empty list; single gate for SSR and the headless API. */
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
    throw new DomainError('NOT_FOUND', 'Webmention 不存在。')
  }
  // A hidden mention returns to the public page only via successful re-verification.
  if (status === 'approved' && row.status === 'hidden') {
    throw new DomainError('BAD_REQUEST', '已隐藏的 Webmention 只能通过重新验证恢复。')
  }
  await setWebmentionStatus(db, row.id, status)
}

// Idempotent transitions, so a double-click never errors.
export async function approveWebmention(db: Database, id: string): Promise<void> {
  await moderate(db, id, 'approved')
}

export async function rejectWebmention(db: Database, id: string): Promise<void> {
  await moderate(db, id, 'rejected')
}
