import type { HistoryState } from '@lexical/react/LexicalHistoryPlugin'
import type { LexicalEditor } from 'lexical'

export function purgeDeadEditorHistoryEntries(historyState: HistoryState, liveEditor: LexicalEditor) {
  const filterInPlace = (stack: HistoryState['undoStack']) => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].editor.getRootElement() === null) {
        stack.splice(i, 1)
      }
    }
  }

  filterInPlace(historyState.undoStack)
  filterInPlace(historyState.redoStack)

  const current = historyState.current
  if (current?.editor.getRootElement() === null) {
    historyState.current = { editor: liveEditor, editorState: liveEditor.getEditorState() }
  }
}
