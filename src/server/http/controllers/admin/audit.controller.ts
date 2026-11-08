import { z } from 'zod'

import type { HandlerContext } from '@/server/http/orpc-base'

import { buildAuditLogCsv } from '@/server/domains/audit/export-csv'
import { highlightAuditLogDetails } from '@/server/domains/audit/highlight'
import { toAuditLogItemDto } from '@/server/domains/audit/projection'
import {
  countAuditLogs,
  fetchAuditLogActorMap,
  fetchAuditLogActors,
  listAuditLogs,
  type AuditLogFilterInput,
} from '@/server/domains/audit/services/query'
import { adminProc, localizedOrpcError } from '@/server/http/orpc-base'
import {
  auditLogActorsOutput,
  auditLogExportInput,
  auditLogListInput,
  auditLogListOutput,
} from '@/shared/contracts/audit'
import { idFromString } from '@/shared/utils/id'

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

const list = adminProc
  .route({ method: 'GET', path: '/admin/audit-log/list' })
  .input(auditLogListInput)
  .output(auditLogListOutput)
  .handler(async ({ input, context }) => {
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

const exportCsv = adminProc
  .route({ method: 'POST', path: '/admin/audit-log/export' })
  .input(auditLogExportInput)
  .output(z.string())
  .handler(async ({ input, context }) => {
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

// Actors (distinct users with audit log entries)

const actors = adminProc
  .route({ method: 'GET', path: '/admin/audit-log/actors' })
  .output(auditLogActorsOutput)
  .handler(async ({ context }) => {
    const { db } = context
    const users = await fetchAuditLogActors(db)

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
