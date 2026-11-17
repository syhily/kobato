import type { LexicalEditor } from 'lexical'

import { $canShowPlaceholderCurry } from '@lexical/text'

export function isEditorEmpty(editor: LexicalEditor): boolean {
  // Must read 'pending': card rendering checks nested-editor emptiness right after an
  // undo, when the committed state is not yet updated.
  return editor.read('pending', $canShowPlaceholderCurry(false))
}
