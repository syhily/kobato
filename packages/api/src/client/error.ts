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
