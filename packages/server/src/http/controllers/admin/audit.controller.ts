import type { HandlerContext } from '@kobato/server/http/orpc-base'

import { adminAuditContract } from '@kobato/api/rpc/admin/audit'
import { idFromString } from '@kobato/base/utils/id'
import {
  countAuditLogs,
  fetchAuditLogActorMap,
  fetchAuditLogActors,
  listAuditLogs,
  type AuditLogFilter,
} from '@kobato/db/sqlite/operations/system/audit-log'
import { buildAuditLogCsv } from '@kobato/server/domains/audit/export-csv'
import { highlightAuditLogDetails } from '@kobato/server/domains/audit/highlight'
import { clampDateToRetention, parseDate, toAuditLogItemDto } from '@kobato/server/domains/audit/projection'
import { implementAdmin, localizedOrpcError } from '@kobato/server/http/orpc-base'

interface AuditLogFilterInput {
  action?: string
  resourceType?: string
  actorId?: string
  ip?: string
  dateFrom?: string
  dateTo?: string
}

function toAuditLogFilter(input: AuditLogFilterInput): AuditLogFilter {
  const filter: AuditLogFilter = {}
  if (input.action) {
    filter.action = input.action
  }
  if (input.resourceType) {
    filter.resourceType = input.resourceType
  }
  if (input.actorId) {
    filter.actorId = idFromString(input.actorId)
  }
  if (input.ip) {
    filter.ip = input.ip
  }
  const dateFrom = clampDateToRetention(parseDate(input.dateFrom))
  if (dateFrom) {
    filter.createdAfter = dateFrom
  }
  const dateTo = parseDate(input.dateTo)
  if (dateTo) {
    const endOfDay = new Date(dateTo)
    endOfDay.setDate(endOfDay.getDate() + 1)
    filter.createdBeforeExclusive = endOfDay
  }
  return filter
}

function assertValidActorId(context: HandlerContext, actorId: string | undefined): void {
  if (!actorId) {
    return
  }
  try {
    idFromString(actorId)
  } catch {
    throw localizedOrpcError(context, 'BAD_REQUEST', 'audit.error.invalidActorId')
  }
}

const EXPORT_MAX_ROWS = 10_000

const impl = implementAdmin(adminAuditContract)

const list = impl.list.handler(async ({ input, context }) => {
  const { db } = context

  assertValidActorId(context, input.actorId)

  const filters = toAuditLogFilter(input)
  const total = await countAuditLogs(db, filters)
  const rows = await listAuditLogs(db, filters, input.offset, input.limit)
  const actorMap = await fetchAuditLogActorMap(db, rows)

  const items = rows.map((row) =>
    toAuditLogItemDto(row, row.actorId ? (actorMap.get(String(row.actorId)) ?? null) : null),
  )

  await Promise.all(
    items.map(async (item) => {
      item.detailsHtml = await highlightAuditLogDetails(item.details)
    }),
  )

  return {
    items,
    total,
    hasMore: input.offset + items.length < total,
  }
})

const exportCsv = impl.exportCsv.handler(async ({ input, context }) => {
  const { db } = context

  assertValidActorId(context, input.actorId)

  const filters = toAuditLogFilter(input)
  const total = await countAuditLogs(db, filters)

  if (total > EXPORT_MAX_ROWS) {
    throw localizedOrpcError(context, 'BAD_REQUEST', 'audit.error.exportTooLarge', { max: EXPORT_MAX_ROWS })
  }

  const rows = await listAuditLogs(db, filters, 0, EXPORT_MAX_ROWS)
  const actorMap = await fetchAuditLogActorMap(db, rows)

  return buildAuditLogCsv(rows, actorMap, { includeFullIp: input.includeFullIp })
})

const actors = impl.actors.handler(async ({ context }) => {
  const { db } = context
  const users = await fetchAuditLogActors(db)

  return users.map((u) => ({
    actorId: String(u.id),
    actorName: u.name,
    email: u.email,
  }))
})

export const auditLogRouter = impl.router({
  list,
  exportCsv,
  actors,
})
