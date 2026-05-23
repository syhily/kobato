import { ORPCError } from '@orpc/server'
import { and, count, desc, eq, gte, inArray, isNotNull, lt } from 'drizzle-orm'
import { z } from 'zod'
import { csvEscapeDisplay } from '@/server/domains/audit/csv'
import { stripL3Markers } from '@/server/domains/audit/privacy'
import { maskIp, maskUserAgent } from '@/server/domains/audit/utils'
import { adminProc } from '@/server/http/orpc-base'
import { db } from '@/server/infra/db/pool'
import { auditLog } from '@/server/infra/db/schema/config'
import { user } from '@/server/infra/db/schema/user'
import { getBlogSettingsBundleSync } from '@/shared/config/blog'
import { auditLogActorsOutput, auditLogItemDto, auditLogListInput, auditLogListOutput } from '@/shared/contracts/audit'
import { idFromString } from '@/shared/utils/id'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function parseDate(dateStr: string | undefined): Date | undefined {
  if (!dateStr) {
    return undefined
  }
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) {
    return undefined
  }
  return d
}

export function clampDateToRetention(date: Date | undefined): Date | undefined {
  if (!date) {
    return undefined
  }
  const bundle = getBlogSettingsBundleSync()
  const retentionDays = bundle?.limits?.auditLogDbRetentionDays ?? 30
  const oldest = new Date()
  oldest.setDate(oldest.getDate() - retentionDays)
  oldest.setHours(0, 0, 0, 0)
  return date < oldest ? oldest : date
}

interface AuditLogFilterInput {
  action?: string
  resourceType?: string
  actorId?: string
  dateFrom?: string
  dateTo?: string
}

export function buildWhere(input: AuditLogFilterInput) {
  const conditions = []

  if (input.action) {
    conditions.push(eq(auditLog.action, input.action))
  }
  if (input.resourceType) {
    conditions.push(eq(auditLog.resourceType, input.resourceType))
  }
  if (input.actorId) {
    try {
      conditions.push(eq(auditLog.actorId, idFromString(input.actorId)))
    } catch {
      throw new ORPCError('BAD_REQUEST', { message: 'actorId 格式无效' })
    }
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

export function toItemDto(
  row: typeof auditLog.$inferSelect,
  actorName: string | null,
): z.infer<typeof auditLogItemDto> {
  return {
    id: String(row.id),
    action: row.action,
    actorId: row.actorId ? String(row.actorId) : null,
    actorName,
    actorRole: row.actorRole ?? null,
    resourceType: row.resourceType,
    resourceId: row.resourceId ?? null,
    details: row.details ? (stripL3Markers(row.details) as Record<string, unknown> | null) : null,
    ipAddressMasked: row.ipAddress ? maskIp(row.ipAddress) : null,
    userAgentMasked: row.userAgent ? maskUserAgent(row.userAgent) : null,
    createdAt: row.createdAt.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

const list = adminProc
  .route({ method: 'GET', path: '/admin/audit-log/list' })
  .input(auditLogListInput)
  .output(auditLogListOutput)
  .handler(async ({ input }) => {
    const where = buildWhere(input)

    // Count total
    const countResult = await db.select({ value: count() }).from(auditLog).where(where)
    const total = countResult[0]?.value ?? 0

    // Fetch rows
    const rows = await db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(input.limit)
      .offset(input.offset)

    // Batch fetch actor names
    const actorIds = rows.map((r) => r.actorId).filter((id): id is bigint => id !== null)
    const uniqueActorIds = [...new Set(actorIds)]

    let actorMap = new Map<string, string>()
    if (uniqueActorIds.length > 0) {
      const users = await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, uniqueActorIds))
      actorMap = new Map(users.map((u) => [String(u.id), u.name]))
    }

    const items = rows.map((row) => toItemDto(row, row.actorId ? (actorMap.get(String(row.actorId)) ?? null) : null))

    return {
      items,
      total,
      hasMore: input.offset + items.length < total,
    }
  })

// ---------------------------------------------------------------------------
// Export (CSV)
// ---------------------------------------------------------------------------

const EXPORT_MAX_ROWS = 10_000

const exportCsv = adminProc
  .route({ method: 'POST', path: '/admin/audit-log/export' })
  .input(auditLogListInput.omit({ offset: true, limit: true }))
  .output(z.string())
  .handler(async ({ input }) => {
    const where = buildWhere(input)

    // Count first to enforce limit
    const countResult = await db.select({ value: count() }).from(auditLog).where(where)
    const total = countResult[0]?.value ?? 0

    if (total > EXPORT_MAX_ROWS) {
      throw new ORPCError('BAD_REQUEST', {
        message: `导出记录数超过上限 ${EXPORT_MAX_ROWS} 条，请缩小筛选范围后再试。`,
      })
    }

    // Fetch all matching rows
    const rows = await db.select().from(auditLog).where(where).orderBy(desc(auditLog.createdAt)).limit(EXPORT_MAX_ROWS)

    // Batch fetch actor names
    const actorIds = rows.map((r) => r.actorId).filter((id): id is bigint => id !== null)
    const uniqueActorIds = [...new Set(actorIds)]

    let actorMap = new Map<string, string>()
    if (uniqueActorIds.length > 0) {
      const users = await db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, uniqueActorIds))
      actorMap = new Map(users.map((u) => [String(u.id), u.name]))
    }

    // Build CSV
    const headers = [
      'id',
      'action',
      'actorId',
      'actorName',
      'actorRole',
      'resourceType',
      'resourceId',
      'details',
      'ipAddressMasked',
      'userAgentMasked',
      'createdAt',
    ]
    const lines = [headers.join(',')]

    for (const row of rows) {
      const dto = toItemDto(row, row.actorId ? (actorMap.get(String(row.actorId)) ?? null) : null)
      const cols = [
        csvEscapeDisplay(dto.id),
        csvEscapeDisplay(dto.action),
        csvEscapeDisplay(dto.actorId ?? ''),
        csvEscapeDisplay(dto.actorName ?? ''),
        csvEscapeDisplay(dto.actorRole ?? ''),
        csvEscapeDisplay(dto.resourceType),
        csvEscapeDisplay(dto.resourceId ?? ''),
        csvEscapeDisplay(dto.details ? JSON.stringify(dto.details) : ''),
        csvEscapeDisplay(dto.ipAddressMasked ?? ''),
        csvEscapeDisplay(dto.userAgentMasked ?? ''),
        csvEscapeDisplay(dto.createdAt),
      ]
      lines.push(cols.join(','))
    }

    return '\uFEFF' + lines.join('\n') + '\n'
  })

// ---------------------------------------------------------------------------
// Actors (distinct users with audit log entries)
// ---------------------------------------------------------------------------

const actors = adminProc
  .route({ method: 'GET', path: '/admin/audit-log/actors' })
  .output(auditLogActorsOutput)
  .handler(async () => {
    const actorRows = await db
      .select({ actorId: auditLog.actorId })
      .from(auditLog)
      .where(isNotNull(auditLog.actorId))
      .groupBy(auditLog.actorId)

    const actorIds = actorRows.map((r) => r.actorId).filter((id): id is bigint => id !== null)

    if (actorIds.length === 0) {
      return []
    }

    const users = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(inArray(user.id, actorIds))
      .orderBy(user.name)

    return users.map((u) => ({
      actorId: String(u.id),
      actorName: u.name,
      email: u.email,
    }))
  })

export const auditLogRouter = {
  list,
  exportCsv,
  actors,
}
