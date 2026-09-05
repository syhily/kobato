import type { LexicalEditor } from 'lexical'

import { $canShowPlaceholderCurry } from '@lexical/text'

export function isEditorEmpty(editor: LexicalEditor): boolean {
  // NOTE: This feels hacky but was required because we check editor empty state
  // when rendering cards to determine whether to show nested editors. But
  // _after an undo_ at the point we check the nested editor state is not yet fully committed.
  // 'pending' reads the pending state if it exists, otherwise the committed one —
  // the public equivalent (Lexical 0.46 EditorReadMode) of the previous
  // `_pendingEditorState || getEditorState()` private access.
  return editor.read('pending', $canShowPlaceholderCurry(false))
}
