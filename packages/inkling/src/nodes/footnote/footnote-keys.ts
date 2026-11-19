function randomChunk(): string {
  const bytes = new Uint8Array(8)
  if (typeof globalThis !== 'undefined' && typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  let out = ''
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(36).padStart(2, '0')
  }
  return out.slice(0, 12)
}

export function createFootnoteTargetKey(): string {
  return randomChunk()
}

const importedSlugMaps = new WeakMap<Document, Map<string, string>>()

export function resolveImportedFootnoteTargetKey(document: Document, slug: string): string {
  if (document === null || document === undefined) {
    throw new Error(
      'resolveImportedFootnoteTargetKey requires the import pass document: refs and definitions of one import batch with the same slug must resolve to the same targetKey',
    )
  }
  let slugMap = importedSlugMaps.get(document)
  if (!slugMap) {
    slugMap = new Map()
    importedSlugMaps.set(document, slugMap)
  }
  const existing = slugMap.get(slug)
  if (existing !== undefined) {
    return existing
  }
  const targetKey = createFootnoteTargetKey()
  slugMap.set(slug, targetKey)
  return targetKey
}
