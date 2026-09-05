import {
  createEditor,
  type EditorState,
  type Klass,
  type LexicalEditor,
  type LexicalNode,
  type LexicalNodeReplacement,
} from 'lexical'

import MINIMAL_NODES from '@/nodes/MinimalNodes'
import generateEditorState from '@/utils/generateEditorState'
import { MINIMAL_DOCUMENT_LEGACY_PAYLOAD } from '@/utils/initial-document'

// nested editors bootstrap from the historical payload dialect (src/utils/initial-document.ts)
const BLANK_EDITOR_STATE = JSON.stringify(MINIMAL_DOCUMENT_LEGACY_PAYLOAD)

export interface SetupNestedEditorOptions {
  editor?: LexicalEditor
  initialEditorState?: string
  nodes?: ReadonlyArray<Klass<LexicalNode> | LexicalNodeReplacement>
}

export function setupNestedEditor({
  editor,
  initialEditorState = BLANK_EDITOR_STATE,
  nodes = MINIMAL_NODES,
}: SetupNestedEditorOptions = {}): LexicalEditor {
  if (editor) {
    return editor
  }

  const createdEditor = createEditor({ nodes })
  // set up a blank document with a paragraph otherwise the editor won't receive focus
  const editorState = createdEditor.parseEditorState(initialEditorState)
  createdEditor.setEditorState(editorState, { tag: 'history-merge' }) // use history merge to prevent undo clearing the initial state
  return createdEditor
}

export function populateNestedEditor(nestedEditor: LexicalEditor, html: string): EditorState | undefined {
  if (!html) {
    return undefined
  }

  const editorState: EditorState = generateEditorState({
    editor: nestedEditor,
    initialHtml: html,
  })

  nestedEditor.setEditorState(editorState, { tag: 'history-merge' }) // use history merge to prevent undo clearing the initial state
  return editorState
}
