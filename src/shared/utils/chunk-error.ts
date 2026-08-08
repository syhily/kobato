// A dynamically-imported JS / CSS chunk failed to load: tabs running the
// previous bundle after a deploy hold hashed URLs the server no longer
// serves. Signature-based (isomorphic) because the throw originates in
// the native module loader, which we can't tag.

const MESSAGE_NEEDLES = [
  'failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'importing a module script failed',
  'loading css chunk',
] as const

export function isChunkLoadError(error: unknown): boolean {
  if (error === null || error === undefined) {
    return false
  }

  if (typeof error === 'string') {
    return matchesMessage(error)
  }

  if (typeof error !== 'object') {
    return false
  }

  const name = (error as { name?: unknown }).name
  if (typeof name === 'string' && name === 'ChunkLoadError') {
    return true
  }

  const message = (error as { message?: unknown }).message
  if (typeof message !== 'string') {
    return false
  }
  return matchesMessage(message)
}

function matchesMessage(message: string): boolean {
  const lower = message.toLowerCase()
  if (lower.includes('loading chunk') && lower.includes('failed')) {
    return true
  }
  for (const needle of MESSAGE_NEEDLES) {
    if (lower.includes(needle)) {
      return true
    }
  }
  return false
}
