import type { Database } from '@kobato/db/database'
import type { AuditLogRow, NewAuditLog } from '@kobato/db/types'

import { sqliteOf } from '@kobato/db/database'
import { likeEscape } from '@kobato/db/like-escape'
import { auditLog } from '@kobato/db/schema/config'
import { user } from '@kobato/db/schema/user'
import { and, count, desc, eq, gt, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm'

export interface AuditLogFilter {
  action?: string
  resourceType?: string
  actorId?: number
  ip?: string
  createdAfter?: Date
  createdBeforeExclusive?: Date
}

export function buildAuditLogWhere(filter: AuditLogFilter) {
  const conditions = []
  if (filter.action) {
    conditions.push(eq(auditLog.action, filter.action))
  }
  if (filter.resourceType) {
    conditions.push(eq(auditLog.resourceType, filter.resourceType))
  }
  if (filter.actorId !== undefined) {
    conditions.push(eq(auditLog.actorId, filter.actorId))
  }
  if (filter.ip) {
    conditions.push(likeEscape(auditLog.ipAddress, filter.ip))
  }
  if (filter.createdAfter) {
    conditions.push(gte(auditLog.createdAt, filter.createdAfter))
  }
  if (filter.createdBeforeExclusive) {
    conditions.push(lt(auditLog.createdAt, filter.createdBeforeExclusive))
  }
  return conditions.length > 0 ? and(...conditions) : undefined
}

export async function countAuditLogs(db: Database, filter: AuditLogFilter): Promise<number> {
  const countResult = await sqliteOf(db).select({ value: count() }).from(auditLog).where(buildAuditLogWhere(filter))
  return countResult[0]?.value ?? 0
}

export async function listAuditLogs(
  db: Database,
  filter: AuditLogFilter,
  offset: number,
  limit: number,
): Promise<AuditLogRow[]> {
  return sqliteOf(db)
    .select()
    .from(auditLog)
    .where(buildAuditLogWhere(filter))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .offset(offset)
}

export async function fetchAuditLogActorMap(db: Database, rows: readonly AuditLogRow[]): Promise<Map<string, string>> {
  const actorIds = rows.map((r) => r.actorId).filter((id): id is number => id !== null)
  const uniqueActorIds = [...new Set(actorIds)]
  if (uniqueActorIds.length === 0) {
    return new Map()
  }
  const users = await sqliteOf(db)
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, uniqueActorIds))
  return new Map(users.map((u) => [String(u.id), u.name]))
}

export interface AuditActorRow {
  id: number
  name: string
  email: string
}

export async function fetchAuditLogActors(db: Database): Promise<AuditActorRow[]> {
  const actorRows = await sqliteOf(db)
    .select({ actorId: auditLog.actorId })
    .from(auditLog)
    .where(isNotNull(auditLog.actorId))
    .groupBy(auditLog.actorId)

  const actorIds = actorRows.map((r) => r.actorId).filter((id): id is number => id !== null)
  if (actorIds.length === 0) {
    return []
  }
  return sqliteOf(db)
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(inArray(user.id, actorIds))
    .orderBy(user.name)
}

export interface AuditArchiveDay {
  day: string
  count: number
}

export async function listAuditArchiveDaysBefore(db: Database, cutoff: Date): Promise<AuditArchiveDay[]> {
  return sqliteOf(db)
    .select({
      day: sql<string>`date(${auditLog.createdAt} / 1000, 'unixepoch')`,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(auditLog)
    .where(lt(auditLog.createdAt, cutoff))
    .groupBy(sql`date(${auditLog.createdAt} / 1000, 'unixepoch')`)
    .orderBy(sql`date(${auditLog.createdAt} / 1000, 'unixepoch')`)
}

export async function listAuditLogPageForArchive(
  db: Database,
  range: { dayStart: Date; dayEnd: Date; afterId?: number; limit: number },
): Promise<AuditLogRow[]> {
  const conditions = [gte(auditLog.createdAt, range.dayStart), lt(auditLog.createdAt, range.dayEnd)]
  if (range.afterId !== undefined) {
    conditions.push(gt(auditLog.id, range.afterId))
  }
  return sqliteOf(db)
    .select()
    .from(auditLog)
    .where(and(...conditions))
    .orderBy(auditLog.createdAt, auditLog.id)
    .limit(range.limit)
}

export async function deleteAuditLogsByIds(db: Database, ids: readonly number[], batchSize = 5000): Promise<number> {
  let deleted = 0
  const sdb = sqliteOf(db)
  for (let start = 0; start < ids.length; start += batchSize) {
    const result = await sdb.delete(auditLog).where(inArray(auditLog.id, ids.slice(start, start + batchSize)))
    deleted += Number(result.changes)
  }
  return deleted
}

export async function purgeAuditLogsBefore(db: Database, cutoff: Date): Promise<number> {
  const result = await sqliteOf(db).delete(auditLog).where(lt(auditLog.createdAt, cutoff))
  return Number(result.changes)
}

export function insertAuditLogRows(db: Database, rows: NewAuditLog[]): void {
  sqliteOf(db).insert(auditLog).values(rows).run()
}
