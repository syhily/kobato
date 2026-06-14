import type { z } from 'zod'

import type { auditLog } from '@/server/infra/db/schema/config'

import { stripL3Markers } from '@/server/domains/audit/privacy'
import { maskIp, maskUserAgent } from '@/server/domains/audit/utils'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { auditLogItemDto } from '@/shared/contracts/audit'
import { isRecord } from '@/shared/utils/type-guards'

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

export function toAuditLogItemDto(
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
    details: row.details
      ? (() => {
          const v = stripL3Markers(row.details)
          return isRecord(v) ? v : null
        })()
      : null,
    detailsHtml: null,
    ipAddressMasked: row.ipAddress ? maskIp(row.ipAddress) : null,
    userAgentMasked: row.userAgent ? maskUserAgent(row.userAgent) : null,
    createdAt: row.createdAt.toISOString(),
  }
}
