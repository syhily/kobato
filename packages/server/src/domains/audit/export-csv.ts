import type { auditLog } from '@kobato/db/schema/config'

import { toAuditLogItemDto } from '@kobato/server/domains/audit/projection'

const FORMULA_PREFIXES = new Set(['=', '+', '-', '@'])

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

const HEADERS = [
  'id',
  'action',
  'actorId',
  'actorName',
  'actorRole',
  'resourceType',
  'resourceId',
  'details',
  'ipAddress',
  'userAgentMasked',
  'createdAt',
]

export interface AuditLogCsvOptions {
  includeFullIp?: boolean
}

export function buildAuditLogCsv(
  rows: Array<typeof auditLog.$inferSelect>,
  actorMap: Map<string, string>,
  options: AuditLogCsvOptions,
): string {
  const lines = [HEADERS.join(',')]

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
      csvEscapeDisplay(options.includeFullIp ? (row.ipAddress ?? '') : (dto.ipAddressMasked ?? '')),
      csvEscapeDisplay(dto.userAgentMasked ?? ''),
      csvEscapeDisplay(dto.createdAt),
    ]
    lines.push(cols.join(','))
  }

  return '\uFEFF' + lines.join('\n') + '\n'
}
