// Isomorphic API error-shape helpers (not in `ui/lib` — boundaries contract).
// The server translates per request: `ORPCError.message` carries the issue
// summary and `data` ships `{ descriptor, issues }`; bare-array rejections
// keep their server message unchanged.

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
 * The stable `messageKey` of a rejection carrying `error.data =
 * { descriptor, issues? }`; client branches compare this, never localized prose.
 * `undefined` for raw errors.
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
