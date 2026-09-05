import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { DRAG_DROP_PASTE } from '@lexical/rich-text'
import { $canShowPlaceholder } from '@lexical/text'
import { type LexicalEditor } from 'lexical'
import React from 'react'

import { focusEditorAt, insertParagraphAt, lastNodeIsDecorator } from '@/plugins/behaviour/external-control'

export interface ExternalControlAPI {
  editorInstance: LexicalEditor
  serialize: () => string
  editorIsEmpty: () => boolean
  focusEditor: (options?: { position?: 'top' | 'bottom' }) => void
  blurEditor: () => void
  insertParagraphAtTop: (options?: { focus?: boolean }) => void
  insertParagraphAtBottom: (options?: { focus?: boolean }) => void
  insertFiles: (files: File[]) => void
  lastNodeIsDecorator: () => boolean
}

// used to register a minimal API for controlling the editor from the consuming app
// designed to allow typical behaviours without the consuming app needing to bundle the lexical library.
// The tree surgeries live in `@/plugins/behaviour/external-control`; this
// plugin is API assembly only.
export const ExternalControlPlugin = ({ registerAPI }: { registerAPI: (api: ExternalControlAPI | null) => void }) => {
  const [editor] = useLexicalComposerContext()

  React.useEffect(() => {
    if (!registerAPI) {
      return
    }

    const API: ExternalControlAPI = {
      // give access to the editor instance so the Lexical API can be used directly if needed
      editorInstance: editor,
      // simplified API methods for typical consumer app actions
      serialize() {
        return JSON.stringify(editor.getEditorState())
      },
      editorIsEmpty() {
        return editor.getEditorState().read(() => $canShowPlaceholder(false))
      },
      focusEditor(options = {}) {
        focusEditorAt(editor, options)
      },
      blurEditor() {
        editor.blur()
      },
      insertParagraphAtTop(options = {}) {
        insertParagraphAt(editor, 'top', options)
      },
      insertParagraphAtBottom(options = {}) {
        insertParagraphAt(editor, 'bottom', options)
      },
      insertFiles(files: File[]) {
        editor.dispatchCommand(DRAG_DROP_PASTE, files)
      },
      lastNodeIsDecorator() {
        return lastNodeIsDecorator(editor)
      },
    }

    registerAPI(API)

    return () => {
      registerAPI(null)
    }
  }, [editor, registerAPI])
  return null
}

export default ExternalControlPlugin
