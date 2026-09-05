// Footnote targetKey minting and the import-time recast map. A targetKey is
// the tree-side counterpart of kobato's definition `_key` / ref `targetKey`
// pair; keys are random 12-char `[a-z0-9]` chunks (kobato's generateBlockKey
// shape) — short enough to read in DevTools, unique enough to never collide
// within a document.
//
// The recast map implements the reviewed import policy (导入即新实体):
// pasting or importing footnotes mints FRESH targetKeys — two pastes of the
// same source must not share keys, or the renumber engine's dedup would
// merge them into one footnote. Ref and definition conversions run
// independently during one `$generateNodesFromDOM` pass, so the map
// correlates them by their source anchor slug. It is scoped per import
// DOCUMENT (refs and defs in one pass share the parsed document; the next
// paste parses a fresh one), which gives both halves of the policy: within
// a pass the same slug resolves to one key (two refs to one footnote stay
// one footnote); across passes the same slug mints anew.

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

/**
 * Resolve an imported ref or definition to its targetKey: the key already
 * minted under this slug earlier in the same import pass, or a fresh one.
 * Every lookup is get-or-mint, so an orphan definition (no ref imported its
 * slug) still lands a fresh key.
 */
export function resolveImportedFootnoteTargetKey(document: Document, slug: string): string {
  // No null early-return: a null document must not silently mint a fresh key
  // per call — refs and definitions of the same import batch carrying the
  // same slug MUST resolve to the same key, which is only possible when the
  // recast map keys on the real pass document. A WeakMap null key would
  // throw a bare TypeError; name the contract instead.
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
