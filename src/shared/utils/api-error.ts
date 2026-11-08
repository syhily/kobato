// Isomorphic API error-shape helpers shared by the upload hook and the
// admin views (can't live in ui/lib — boundaries contract).
//
// Error copy is NOT translated or composed here: the server folds a domain
// error's issue summary into `ORPCError.message` (per request locale) and ships
// the structured `{ descriptor, issues }` in `data`. The client consumes the
// message verbatim; legacy bare-array rejections fall back to their server
// message unchanged.

export function extractApiErrorMessage(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) {
    return undefined
  }
  if (!('error' in data)) {
    return undefined
  }
  const error = data.error
  if (typeof error !== 'object' || error === null) {
    return undefined
  }
  if (!('message' in error)) {
    return undefined
  }
  return typeof error.message === 'string' ? error.message : undefined
}

export function isApiAccepted(data: unknown): boolean {
  return typeof data === 'object' && data !== null && 'accepted' in data && data.accepted === true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * The stable `messageKey` of a rejection carrying the descriptor payload
 * (`error.data = { descriptor, issues? }`) — client branches compare THIS, never
 * localized prose. `undefined` for legacy/raw errors.
 */
export function apiErrorDescriptorKey(error: unknown): string | undefined {
  if (!isRecord(error)) {
    return undefined
  }
  const data = error.data
  if (!isRecord(data) || !('descriptor' in data)) {
    return undefined
  }
  const descriptor = data.descriptor
  if (!isRecord(descriptor) || typeof descriptor.messageKey !== 'string') {
    return undefined
  }
  return descriptor.messageKey
}
