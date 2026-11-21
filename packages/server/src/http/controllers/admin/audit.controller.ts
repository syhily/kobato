import type { HandlerContext } from '@kobato/server/http/orpc-base'

import { adminAuditContract } from '@kobato/api/admin/audit'
import { buildAuditLogCsv } from '@kobato/server/domains/audit/export-csv'
import { highlightAuditLogDetails } from '@kobato/server/domains/audit/highlight'
import { toAuditLogItemDto } from '@kobato/server/domains/audit/projection'
import {
  countAuditLogs,
  fetchAuditLogActorMap,
  fetchAuditLogActors,
  listAuditLogs,
  type AuditLogFilterInput,
} from '@kobato/server/domains/audit/services/query'
import { implementAdmin, localizedOrpcError } from '@kobato/server/http/orpc-base'
import { idFromString } from '@kobato/utils/id'

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

  const filters: AuditLogFilterInput = input
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

  const filters: AuditLogFilterInput = input
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
