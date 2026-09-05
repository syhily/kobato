import { createEmptyHistoryState, type HistoryState } from '@lexical/react/LexicalHistoryPlugin'
import { createEditor, type LexicalEditor } from 'lexical'
import { describe, expect, it } from 'vitest'

import { purgeDeadEditorHistoryEntries } from '@/plugins/behaviour/history-purge'

type HistoryStateEntry = HistoryState['undoStack'][number]

function makeEditor(withRoot: boolean): LexicalEditor {
  const editor = createEditor()
  if (withRoot) {
    editor.setRootElement(document.createElement('div'))
  }
  return editor
}

function entry(editor: LexicalEditor): HistoryStateEntry {
  return { editor, editorState: editor.getEditorState() }
}

describe('purgeDeadEditorHistoryEntries', () => {
  it('drops undo/redo entries owned by rootless (dead) editors', () => {
    const live = makeEditor(true)
    const dead = makeEditor(false)
    const historyState = createEmptyHistoryState()
    historyState.undoStack.push(entry(live), entry(dead), entry(live))
    historyState.redoStack.push(entry(dead), entry(live))

    purgeDeadEditorHistoryEntries(historyState, live)

    expect(historyState.undoStack.map((e) => e.editor)).toEqual([live, live])
    expect(historyState.redoStack.map((e) => e.editor)).toEqual([live])
  })

  it('re-points a dead-owned current entry at the live editor state', () => {
    const live = makeEditor(true)
    const dead = makeEditor(false)
    const historyState = createEmptyHistoryState()
    historyState.current = entry(dead)

    purgeDeadEditorHistoryEntries(historyState, live)

    expect(historyState.current?.editor).toBe(live)
    expect(historyState.current?.editorState).toBe(live.getEditorState())
  })

  it('keeps a live-owned current entry untouched', () => {
    const live = makeEditor(true)
    const historyState = createEmptyHistoryState()
    const current = entry(live)
    historyState.current = current

    purgeDeadEditorHistoryEntries(historyState, live)

    expect(historyState.current).toBe(current)
  })
})
