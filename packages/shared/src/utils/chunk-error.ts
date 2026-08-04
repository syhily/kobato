// Detect failures to load a dynamically-imported JS / CSS chunk.
//
// After a new deploy ships, browser tabs running the previous bundle
// still hold dynamic `import()` URLs that point at content-hashed
// filenames the server no longer serves. The next route navigation,
// `React.lazy()` resolution, or chunk preload from such a tab throws
// with one of the messages enumerated below.
//
// The detector is signature-based (and isomorphic) because the throw
// originates inside the platform's native module loader -- we don't
// control the construction site and so cannot tag the error the way
// Next.js does with its `markAssetError` symbol.

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
