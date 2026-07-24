import type { AuditContext, AuditEventInput } from '@/server/domains/audit/types'

import { tagL3InDetails } from '@/server/domains/audit/privacy'
import { pushAuditEvent } from '@/server/domains/audit/repos/batcher'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('audit.service')

// Public API

/**
 * Record an audit event.
 *
 * This function is **fire-and-forget**: it pushes the event into an
 * in-memory batcher and returns immediately. The actual DB insert
 * happens asynchronously (batched, flushed every 50 events or 500ms).
 *
 * L3-sensitive fields inside `details` are automatically wrapped in
 * `{E}…{/E}` markers before storage.
 *
 * Never throws. Any failure (DB down, malformed row, …) is logged and
 * silently swallowed so the caller's business logic is never blocked.
 */
export function recordAuditEvent(input: AuditEventInput): void {
  try {
    const tagged = tagL3InDetails(input.details)
    pushAuditEvent({
      ...input,
      details: tagged,
    })
  } catch (err) {
    // Batcher push is synchronous (O(1) array push), so this catch is
    // defensive against programming errors in tagL3InDetails.
    log.error('recordAuditEvent failed', {
      action: input.action,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}

// Context helpers

/**
 * Extract audit-relevant fields from an AuditContext.
 * Useful when the caller already has a context object and wants to
 * avoid manual field extraction.
 */
export function buildAuditContext(context: AuditContext) {
  return {
    actorId: context.viewer?.userId,
    actorRole: context.viewer?.role ?? null,
    ipAddress: context.clientAddress,
    userAgent: context.requestFacts.userAgent,
  }
}

/**
 * Convenience wrapper that combines `buildAuditContext` + `recordAuditEvent`
 * for the common case where the caller has an AuditContext.
 */
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
