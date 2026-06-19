import type { InklingDocument } from '@/shared/inkling/schema'

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
    children: [
      {
        type: 'paragraph',
        version: 1,
        direction: null,
        format: '',
        indent: 0,
        children: [],
      },
    ],
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
