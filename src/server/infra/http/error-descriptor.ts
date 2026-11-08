// Descriptor construction + the one runtime message-id check the server needs.
//
// A producer that knows a catalog key builds the descriptor here; the Hono/oRPC
// boundaries only translate descriptors (see `translate-domain-error.ts`). The
// English `fallbackMessage` is rendered eagerly — params included — so logs, old
// clients and diagnostics read a finished sentence instead of a template.
//
// Legacy raw messages (an un-migrated domain's Chinese prose, Zod's own English
// issue text) wrap the raw text in the `error.api.rawMessage` passthrough key:
// every locale formats it as `{message}`, so the wire shape is uniform while the
// text renders unchanged.

import type { z } from 'zod'

import type { ErrorIssueWire, ErrorMessageDescriptor, ErrorMessageParams } from '@/shared/contracts/api-error'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { createServerTranslator } from '@/server/infra/i18n'
import { BASE_LOCALE } from '@/shared/i18n/locales'
import { uiMessagesEnUS } from '@/shared/i18n/messages/ui/en-US'
import { zodIssueBounds } from '@/shared/utils/zod-issue-bounds'

/** The passthrough catalog key wrapping a legacy raw message. */
export const RAW_MESSAGE_KEY = 'error.api.rawMessage'

/** Runtime membership test against the English baseline (the closed key set). */
export function isUiMessageId(value: string): value is UiMessageId {
  return Object.hasOwn(uiMessagesEnUS, value)
}

/**
 * Structural probe for "carries a descriptor", not `instanceof`: a
 * `worker_threads` clone, a duplicate bundle or `vi.resetModules()` give the
 * producing class a different identity, and the boundary must still find the
 * descriptor. Used by the Hono/oRPC guards and the self-update job status.
 */
export function carriesErrorMessageDescriptor(value: unknown): value is { descriptor: ErrorMessageDescriptor } {
  if (typeof value !== 'object' || value === null || !('descriptor' in value)) {
    return false
  }
  const descriptor: unknown = value.descriptor
  return (
    typeof descriptor === 'object' &&
    descriptor !== null &&
    'messageKey' in descriptor &&
    typeof descriptor.messageKey === 'string'
  )
}

/** Wrap raw (legacy / technical) text so every transport still emits a descriptor. */
export function rawMessageDescriptor(message: string): ErrorMessageDescriptor {
  return { messageKey: RAW_MESSAGE_KEY, params: { message }, fallbackMessage: message }
}

/** Descriptor for a typed message id; `params` fill the ICU placeholders. */
export function descriptorFor(messageKey: UiMessageId, params?: ErrorMessageParams): ErrorMessageDescriptor {
  return {
    messageKey,
    ...(params === undefined ? {} : { params }),
    fallbackMessage: createServerTranslator(BASE_LOCALE).format(messageKey, params),
  }
}

/**
 * Descriptor for a value that MAY be a catalog id: customs Zod messages carry
 * ids, while Zod's own default prose stays raw English (documented fallback —
 * standard schema prose is not translated).
 */
export function messageDescriptor(message: string, params?: ErrorMessageParams): ErrorMessageDescriptor {
  return isUiMessageId(message) ? descriptorFor(message, params) : rawMessageDescriptor(message)
}

/**
 * The ICU params a Zod issue carries: numeric `minimum`/`maximum` bounds
 * (`too_small`/`too_big`) and an explicit `params` bag on custom issues
 * (e.g. the password byte ceiling). Scalars only — the wire params are
 * `string | number | boolean | null`.
 */
function zodIssueParams(issue: z.core.$ZodIssue): ErrorMessageParams | undefined {
  const bounds = zodIssueBounds(issue)
  if (bounds !== undefined) {
    return bounds
  }
  if (!('params' in issue) || typeof issue.params !== 'object' || issue.params === null) {
    return undefined
  }
  const params: ErrorMessageParams = {}
  for (const [key, value] of Object.entries(issue.params)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      params[key] = value
    }
  }
  return Object.keys(params).length === 0 ? undefined : params
}

/** One Zod issue → the wire issue (descriptor + producer code + field path). */
export function zodIssueToWire(issue: z.core.$ZodIssue): ErrorIssueWire {
  const path = issue.path.map(String)
  return {
    ...messageDescriptor(issue.message, zodIssueParams(issue)),
    code: issue.code,
    ...(path.length === 0 ? {} : { path }),
  }
}

export function zodIssuesToWire(issues: readonly z.core.$ZodIssue[]): ErrorIssueWire[] {
  return issues.map(zodIssueToWire)
}
