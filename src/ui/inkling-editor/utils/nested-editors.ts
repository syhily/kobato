import { createEditor, type EditorState, type Klass, type LexicalEditor, type LexicalNode } from 'lexical'

import { MINIMAL_NODES } from '@/ui/inkling-editor/index'
import generateEditorState from '@/ui/inkling-editor/utils/generateEditorState'

const BLANK_EDITOR_STATE = JSON.stringify({
  root: {
    children: [
      {
        children: [],
        direction: null,
        format: '',
        indent: 0,
        type: 'paragraph',
        version: 1,
      },
    ],
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
})

export interface SetupNestedEditorOptions {
  editor?: LexicalEditor
  initialEditorState?: string
  nodes?: ReadonlyArray<Klass<LexicalNode>>
}

export function setupNestedEditor(
  node: Record<string, unknown>,
  editorProperty: string,
  { editor, initialEditorState = BLANK_EDITOR_STATE, nodes = MINIMAL_NODES }: SetupNestedEditorOptions = {},
): void {
  if (editor) {
    node[editorProperty] = editor
  } else {
    node[editorProperty] = createEditor({ nodes })

    const createdEditor = node[editorProperty] as LexicalEditor
    // set up a blank document with a paragraph otherwise the editor won't receive focus
    const editorState = createdEditor.parseEditorState(initialEditorState)
    createdEditor.setEditorState(editorState, { tag: 'history-merge' }) // use history merge to prevent undo clearing the initial state
  }
}

export function populateNestedEditor(node: Record<string, unknown>, editorProperty: string, html: string): void {
  if (!html) {
    return
  }

  const nestedEditor = node[editorProperty] as LexicalEditor
  const editorState: EditorState = generateEditorState({
    editor: nestedEditor,
    initialHtml: html,
  })

  nestedEditor.setEditorState(editorState, { tag: 'history-merge' }) // use history merge to prevent undo clearing the initial state

  // store the initial state separately as it's passed in to `<CollaborationPlugin />`
  // for use when there is no YJS document already stored
  node[`${editorProperty}InitialState`] = editorState
}
