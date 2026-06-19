import type { EditorState } from 'lexical'

import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { useCallback } from 'react'

import type { InklingDocument } from '@/shared/inkling/schema'

import { INKLING_SCHEMA_VERSION, safeValidateInklingDocument } from '@/shared/inkling/schema'

function editorStateToInklingDocument(editorState: EditorState): InklingDocument {
  const serialized = editorState.toJSON()
  return {
    _type: 'inkling',
    schemaVersion: INKLING_SCHEMA_VERSION,
    lexicalVersion: '0.45.0',
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    root: serialized.root as InklingDocument['root'],
  }
}

export interface OnInklingDocumentChangePluginProps {
  /** Fired on every editor update with a validated Inkling document. */
  onChange: (document: InklingDocument) => void
}

export function OnInklingDocumentChangePlugin({ onChange }: OnInklingDocumentChangePluginProps) {
  const handleChange = useCallback(
    (editorState: EditorState) => {
      const document = editorStateToInklingDocument(editorState)
      const validation = safeValidateInklingDocument(document)
      if (validation.ok) {
        onChange(validation.document)
      }
    },
    [onChange],
  )

  return <OnChangePlugin onChange={handleChange} />
}
