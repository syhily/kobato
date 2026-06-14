import { ORPCError } from '@orpc/server'
import { z } from 'zod'

import { highlightAuditLogDetails } from '@/server/domains/audit/highlight'
import { toAuditLogItemDto } from '@/server/domains/audit/projection'
import {
  countAuditLogs,
  fetchAuditLogActorMap,
  fetchAuditLogActors,
  listAuditLogs,
  type AuditLogFilterInput,
} from '@/server/domains/audit/repos/query'
import { adminProc } from '@/server/http/orpc-base'
import { auditLogActorsOutput, auditLogListInput, auditLogListOutput } from '@/shared/contracts/audit'
import { idFromString } from '@/shared/utils/id'

// Helpers

const FORMULA_PREFIXES = new Set(['=', '+', '-', '@'])

// Exported for testing only.
export function csvEscapeDisplay(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return ''
  }
  const str = typeof value === 'string' ? value : String(value)
  const sanitized = str.length > 0 && FORMULA_PREFIXES.has(str[0]) ? `\t${str}` : str
  if (/[",\n\r]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`
  }
  return sanitized
}

const EXPORT_MAX_ROWS = 10_000

// List

const list = adminProc
  .route({ method: 'GET', path: '/admin/audit-log/list' })
  .input(auditLogListInput)
  .output(auditLogListOutput)
  .handler(async ({ input, context }) => {
    const { db } = context

    if (input.actorId) {
      try {
        idFromString(input.actorId)
      } catch {
        throw new ORPCError('BAD_REQUEST', { message: 'actorId 格式无效' })
      }
    }

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

// Export (CSV)

const exportCsv = adminProc
  .route({ method: 'POST', path: '/admin/audit-log/export' })
  .input(auditLogListInput.omit({ offset: true, limit: true }))
  .output(z.string())
  .handler(async ({ input, context }) => {
    const { db } = context

    if (input.actorId) {
      try {
        idFromString(input.actorId)
      } catch {
        throw new ORPCError('BAD_REQUEST', { message: 'actorId 格式无效' })
      }
    }

    const filters: AuditLogFilterInput = input
    const total = await countAuditLogs(db, filters)

    if (total > EXPORT_MAX_ROWS) {
      throw new ORPCError('BAD_REQUEST', {
        message: `导出记录数超过上限 ${EXPORT_MAX_ROWS} 条，请缩小筛选范围后再试。`,
      })
    }

    const rows = await listAuditLogs(db, filters, 0, EXPORT_MAX_ROWS)
    const actorMap = await fetchAuditLogActorMap(db, rows)

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
      const dto = toAuditLogItemDto(row, row.actorId ? (actorMap.get(String(row.actorId)) ?? null) : null)
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
