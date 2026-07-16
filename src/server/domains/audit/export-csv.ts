import type { auditLog } from '@/server/infra/db/schema/config'

import { toAuditLogItemDto } from '@/server/domains/audit/projection'

// Display-oriented CSV for spreadsheet export: standard quoting plus
// formula-injection protection (cells starting with `=`, `+`, `-`, `@`
// get a tab prefix). Distinct from `server/infra/csv.ts`, which follows
// Postgres COPY semantics (`\N` nulls, no formula protection) — the two
// models are intentionally not shared.
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

// Builds the admin audit-log CSV export: BOM + header row + one row per
// audit entry. `includeFullIp` swaps the masked IP column for the raw one.
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
