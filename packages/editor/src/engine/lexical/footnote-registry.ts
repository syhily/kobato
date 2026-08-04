import type { LexicalEditor } from 'lexical'

import { OPEN_FOOTNOTE_DIALOG_COMMAND } from '@kobato/editor/engine/lexical/commands'
import { COMMAND_PRIORITY_LOW } from 'lexical'

/**
 * Host-owned footnote surface for the Lexical body editor.
 *
 * The footnote dialog state lives in the engine's footnote loop
 * (`useLexicalFootnotes`), but the click-to-edit entry point is inside
 * the node view (`FootnoteRefView` in `lexical-core`), which must not
 * import the engine's hook — the same separation as the picker bridge.
 * The loop registers its callbacks through `registerFootnoteHandlers`;
 * node views read them via `getFootnoteHandlers`. `OPEN_FOOTNOTE_DIALOG_COMMAND`
 * (toolbar / slash menu / caret trigger) translates into the insert
 * callback on the same registry.
 */

export interface FootnoteHandlers {
  /** Open the footnote insert dialog (create mode). */
  openInsertDialog: () => void
  /** Open the footnote edit dialog for an existing definition (`targetKey`). */
  openEditDialog: (targetKey: string) => void
}

const handlersByEditor = new WeakMap<LexicalEditor, FootnoteHandlers>()

export function registerFootnoteHandlers(editor: LexicalEditor, handlers: FootnoteHandlers): () => void {
  handlersByEditor.set(editor, handlers)
  const unregisterOpenDialog = editor.registerCommand(
    OPEN_FOOTNOTE_DIALOG_COMMAND,
    () => {
      handlers.openInsertDialog()
      return true
    },
    COMMAND_PRIORITY_LOW,
  )
  return () => {
    unregisterOpenDialog()
    if (handlersByEditor.get(editor) === handlers) {
      handlersByEditor.delete(editor)
    }
  }
}

/** Current handlers for an editor, if any (node views read the edit callback from here). */
export function getFootnoteHandlers(editor: LexicalEditor): FootnoteHandlers | undefined {
  return handlersByEditor.get(editor)
}
