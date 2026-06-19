import type { InklingBlockNode, InklingDocument } from '@/shared/inkling/schema'

import { createEmptyInklingDocument } from '@/shared/inkling/empty'
import { portableTextToInklingDocument } from '@/shared/inkling/migrate-pt'
import { INKLING_LEXICAL_VERSION, INKLING_SCHEMA_VERSION } from '@/shared/inkling/schema'

/**
 * Test helper: return a canonical empty Inkling document.
 * Use this wherever a test fixture previously passed `[]` as a body.
 */
export function emptyInklingDocument(): InklingDocument {
  return createEmptyInklingDocument()
}

/**
 * Test helper: convert a legacy PortableText array into an Inkling document.
 * Accepts an empty array (returns an empty Inkling document) and existing
 * Inkling documents (returns them unchanged) so fixture call sites can be
 * migrated incrementally.
 */
export function inklingFromPt(value: InklingDocument | unknown[] | unknown): InklingDocument {
  if (value !== null && typeof value === 'object' && (value as { _type?: string })._type === 'inkling') {
    return value as InklingDocument
  }
  if (Array.isArray(value) && value.length === 0) {
    return createEmptyInklingDocument()
  }
  if (Array.isArray(value)) {
    return portableTextToInklingDocument(value)
  }
  return createEmptyInklingDocument()
}

/**
 * Test helper: build a minimal Inkling document containing a single
 * paragraph with the supplied text. Useful for comment fixtures that
 * previously used a single PortableText block.
 */
export function inklingParagraph(text: string): InklingDocument {
  return inklingDocumentWithBlocks([
    {
      type: 'paragraph',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children: [{ type: 'text', version: 1, text }],
    },
  ])
}

/**
 * Test helper: wrap a list of Inkling block nodes in a canonical document.
 * Useful for article / image-sync fixtures that need full block control.
 */
export function inklingDocumentWithBlocks(children: InklingBlockNode[]): InklingDocument {
  return {
    _type: 'inkling',
    schemaVersion: INKLING_SCHEMA_VERSION,
    lexicalVersion: INKLING_LEXICAL_VERSION,
    root: {
      type: 'root',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children,
    },
  }
}

/**
 * Test helper: build a minimal Inkling document containing a single
 * paragraph with a link. Useful for comment security fixtures that need
 * to exercise link URL validation without going through the PT migration
 * sanitizer.
 */
export function inklingLink(url: string, text: string): InklingDocument {
  return inklingDocumentWithBlocks([
    {
      type: 'paragraph',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children: [
        {
          type: 'link',
          version: 1,
          url,
          target: null,
          rel: null,
          title: null,
          direction: null,
          format: '',
          indent: 0,
          children: [{ type: 'text', version: 1, text }],
        },
      ],
    },
  ])
}
