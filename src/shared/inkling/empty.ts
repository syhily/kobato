import type { InklingDocument, InklingNonRecursiveBlockNode } from '@/shared/inkling/schema'

import { INKLING_LEXICAL_VERSION } from '@/shared/inkling/schema'

function deepFreeze<T>(value: T): T {
  if (value === null || value === undefined) {
    return value
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      deepFreeze(entry)
    }
  } else if (typeof value === 'object') {
    for (const [, entry] of Object.entries(value)) {
      deepFreeze(entry)
    }
  }
  return Object.freeze(value)
}

/**
 * Canonical empty paragraph node. Shared by every site that needs to seed an
 * empty paragraph into a container block (Solution, TwoColumn, footnote
 * definitions, card insert handlers). Previously each call site inlined the
 * full `{ type: 'paragraph', version: 1, direction: null, format: '',
 * indent: 0, children: [] }` literal — 5 copies that could drift.
 *
 * Frozen so accidental mutation of the shared instance throws in strict mode.
 * Use {@link createEmptyInklingParagraph} when you need a mutable copy.
 */
export const EMPTY_INKLING_PARAGRAPH: InklingNonRecursiveBlockNode = deepFreeze({
  type: 'paragraph',
  version: 1,
  direction: null,
  format: '',
  indent: 0,
  children: [],
})

/**
 * Return a mutable deep clone of the canonical empty paragraph. Use this
 * instead of {@link EMPTY_INKLING_PARAGRAPH} when the caller may mutate the
 * returned node (e.g. appending inline children).
 */
export function createEmptyInklingParagraph(): InklingNonRecursiveBlockNode {
  return structuredClone(EMPTY_INKLING_PARAGRAPH)
}

export const EMPTY_INKLING_DOCUMENT: InklingDocument = deepFreeze({
  _type: 'inkling',
  schemaVersion: 1,
  lexicalVersion: INKLING_LEXICAL_VERSION,
  root: {
    type: 'root',
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children: [structuredClone(EMPTY_INKLING_PARAGRAPH)],
  },
})

/**
 * Return a deep clone of the canonical empty Inkling document. Use this instead
 * of assigning `EMPTY_INKLING_DOCUMENT` directly when the caller may mutate the
 * returned document (e.g. filling prerender artifacts).
 */
export function createEmptyInklingDocument(): InklingDocument {
  return structuredClone(EMPTY_INKLING_DOCUMENT)
}
