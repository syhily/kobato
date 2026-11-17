import type { AuditContext, AuditEventInput } from '../types'

import { getLogger } from '../../../infra/logger'
import { tagL3InDetails } from '../privacy'
import { pushAuditEvent } from './batcher'

const log = getLogger('audit.service')

/**
 * Fire-and-forget: never throws; failures are logged and swallowed.
 */
export function recordAuditEvent(input: AuditEventInput): void {
  try {
    const tagged = tagL3InDetails(input.details)
    pushAuditEvent({
      ...input,
      details: tagged,
    })
  } catch (err) {
    // Defensive: push is synchronous, so only tagL3InDetails can fail.
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
