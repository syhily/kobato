import type { EditorState } from 'lexical'

import type { InklingDocument } from '@/shared/inkling/schema'

import { INKLING_LEXICAL_VERSION, INKLING_SCHEMA_VERSION } from '@/shared/inkling/schema'
import { toBlockChildren } from '@/ui/inkling/editor/shared/lexical-bridge'

/**
 * Convert a Lexical `EditorState` into the canonical `InklingDocument` shape.
 *
 * This rebuilds the root from its typed fields rather than casting the whole
 * `serialized.root` so that Lexical-internal extras (e.g. `textFormat`,
 * `textStyle` on the root) are dropped — only schema-valid fields survive.
 * The children array is preserved as-is (the node `exportJSON` shapes already
 * match the Inkling schema for every registered node).
 *
 * This is the single source of truth for editor-state → Inkling-document
 * serialization. The footnote merge path (`OnInklingDocumentChangePlugin`)
 * and the footnote controller both call this; do not duplicate it.
 */
export function editorStateToInklingDocument(editorState: EditorState): InklingDocument {
  const serialized = editorState.toJSON()
  const root = serialized.root
  return {
    _type: 'inkling',
    schemaVersion: INKLING_SCHEMA_VERSION,
    lexicalVersion: INKLING_LEXICAL_VERSION,
    root: {
      type: 'root',
      version: root.version,
      direction: root.direction ?? null,
      format: root.format ?? '',
      indent: root.indent ?? 0,
      children: toBlockChildren(root.children),
    },
  }
}
