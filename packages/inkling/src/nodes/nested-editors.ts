import MINIMAL_NODES from '@kobato/inkling-internal/nodes/MinimalNodes'
import generateEditorState from '@kobato/inkling-internal/utils/generate-editor-state'
import { MINIMAL_DOCUMENT_LEGACY_PAYLOAD } from '@kobato/inkling-internal/utils/initial-document'
import {
  createEditor,
  type EditorState,
  type Klass,
  type LexicalEditor,
  type LexicalNode,
  type LexicalNodeReplacement,
} from 'lexical'

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
  const editorState = createdEditor.parseEditorState(initialEditorState)
  createdEditor.setEditorState(editorState, { tag: 'history-merge' })
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

  nestedEditor.setEditorState(editorState, { tag: 'history-merge' })
  return editorState
}
