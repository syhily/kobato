import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, count, desc, eq, gte, ilike, inArray, isNotNull, lt, sql } from 'drizzle-orm'

import { clampDateToRetention, parseDate } from '@/server/domains/audit/projection'
import { auditLog } from '@/server/infra/db/schema/config'
import { user } from '@/server/infra/db/schema/user'
import { idFromString } from '@/shared/utils/id'

export interface AuditLogFilterInput {
  action?: string
  resourceType?: string
  actorId?: string
  ip?: string
  dateFrom?: string
  dateTo?: string
}

export function buildAuditLogWhere(input: AuditLogFilterInput) {
  const conditions = []

  if (input.action) {
    conditions.push(eq(auditLog.action, input.action))
  }
  if (input.resourceType) {
    conditions.push(eq(auditLog.resourceType, input.resourceType))
  }
  if (input.actorId) {
    conditions.push(eq(auditLog.actorId, idFromString(input.actorId)))
  }
  if (input.ip) {
    conditions.push(ilike(sql`${auditLog.ipAddress}::text`, `%${input.ip}%`))
  }
  const dateFrom = clampDateToRetention(parseDate(input.dateFrom))
  if (dateFrom) {
    conditions.push(gte(auditLog.createdAt, dateFrom))
  }
  const dateTo = parseDate(input.dateTo)
  if (dateTo) {
    const endOfDay = new Date(dateTo)
    endOfDay.setDate(endOfDay.getDate() + 1)
    conditions.push(lt(auditLog.createdAt, endOfDay))
  }

  return conditions.length > 0 ? and(...conditions) : undefined
}

export async function countAuditLogs(db: NodePgDatabase, filters: AuditLogFilterInput): Promise<number> {
  const where = buildAuditLogWhere(filters)
  const countResult = await db.select({ value: count() }).from(auditLog).where(where)
  return countResult[0]?.value ?? 0
}

export async function listAuditLogs(db: NodePgDatabase, filters: AuditLogFilterInput, offset: number, limit: number) {
  const where = buildAuditLogWhere(filters)
  const rows = await db
    .select()
    .from(auditLog)
    .where(where)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .offset(offset)
  return rows
}

export async function fetchAuditLogActorMap(
  db: NodePgDatabase,
  rows: Array<typeof auditLog.$inferSelect>,
): Promise<Map<string, string>> {
  const actorIds = rows.map((r) => r.actorId).filter((id): id is bigint => id !== null)
  const uniqueActorIds = [...new Set(actorIds)]

  if (uniqueActorIds.length === 0) {
    return new Map()
  }

  const users = await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, uniqueActorIds))
  return new Map(users.map((u) => [String(u.id), u.name]))
}

export async function fetchAuditLogActors(db: NodePgDatabase) {
  const actorRows = await db
    .select({ actorId: auditLog.actorId })
    .from(auditLog)
    .where(isNotNull(auditLog.actorId))
    .groupBy(auditLog.actorId)

  const actorIds = actorRows.map((r) => r.actorId).filter((id): id is bigint => id !== null)

  if (actorIds.length === 0) {
    return []
  }

  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(inArray(user.id, actorIds))
    .orderBy(user.name)
}
