import type { LexicalEditor } from 'lexical'

import { $canShowPlaceholderCurry } from '@lexical/text'

export function isEditorEmpty(editor: LexicalEditor): boolean {
  return editor.read('pending', $canShowPlaceholderCurry(false))
}
