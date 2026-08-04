import type { LexicalEditor } from 'lexical'

import { createEmptyHistoryState, registerHistory } from '@lexical/history'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useEffect } from 'react'

/**
 * History registration + undo/redo availability for the Lexical engine.
 *
 * `@lexical/history`'s `registerHistory` exposes an `onHistoryStateChange`
 * callback (0.45 API) that fires whenever the undo/redo stacks mutate —
 * the editor itself has no public `canUndo()` / `canRedo()`, so this is
 * the sanctioned way to drive the toolbar's undo/redo disabled states.
 * The availability is published through a per-editor registry read by
 * `useToolbarSelectionState` (same WeakMap idiom as the picker bridge).
 */

const availabilityByEditor = new WeakMap<LexicalEditor, { canUndo: boolean; canRedo: boolean }>()

export interface HistoryAvailability {
  canUndo: boolean
  canRedo: boolean
}

/** Current undo/redo availability for an editor (updated by `LexicalHistoryPlugin`). */
export function getHistoryAvailability(editor: LexicalEditor): HistoryAvailability {
  return availabilityByEditor.get(editor) ?? { canUndo: false, canRedo: false }
}

/** Registers the history stack (replaces `HistoryPlugin`) and publishes availability. */
export function LexicalHistoryPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const historyState = createEmptyHistoryState()
    const publish = () => {
      availabilityByEditor.set(editor, {
        canUndo: historyState.undoStack.length > 0,
        canRedo: historyState.redoStack.length > 0,
      })
    }
    const unregister = registerHistory(editor, historyState, 1000, undefined, publish)
    return () => {
      unregister()
      availabilityByEditor.delete(editor)
    }
  }, [editor])

  return null
}
