import type { AuditContext, AuditEventInput } from '@kobato/server/domains/audit/types.ts'

import { tagL3InDetails } from '@kobato/server/domains/audit/privacy.ts'
import { pushAuditEvent } from '@kobato/server/domains/audit/services/batcher.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'

const log = getLogger('audit.service')

export function recordAuditEvent(input: AuditEventInput): void {
  try {
    const tagged = tagL3InDetails(input.details)
    pushAuditEvent({
      ...input,
      details: tagged,
    })
  } catch (err) {
    log.error('recordAuditEvent failed', {
      action: input.action,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}

export function buildAuditContext(context: AuditContext) {
  return {
    actorId: context.viewer?.id,
    actorRole: context.viewer?.role ?? null,
    ipAddress: context.clientAddress,
    userAgent: context.requestFacts.userAgent,
  }
}

export function recordAuditEventFromContext(
  context: AuditContext,
  event: Omit<AuditEventInput, 'actorId' | 'actorRole' | 'ipAddress' | 'userAgent'>,
): void {
  const ctx = buildAuditContext(context)
  recordAuditEvent({
    ...event,
    actorId: ctx.actorId,
    actorRole: ctx.actorRole,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  })
}
