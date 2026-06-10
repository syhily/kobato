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
