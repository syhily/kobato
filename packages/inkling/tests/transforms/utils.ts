import type { CreateEditorArgs, LexicalEditor, LexicalNodeConfig } from 'lexical'

import { DEFAULT_BASE_NODES } from '@kobato/inkling-internal/nodes/base'
import { createHeadlessEditor } from '@lexical/headless'
import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import assert from 'node:assert/strict'

export const defaultNodes: LexicalNodeConfig[] = [
  HeadingNode,
  LinkNode,
  ListItemNode,
  ListNode,
  QuoteNode,

  ...DEFAULT_BASE_NODES,
]

export const defaultEditorConfig: CreateEditorArgs = {
  nodes: defaultNodes,
  onError(e: Error) {
    throw e
  },
}

export const createEditor = function (config?: CreateEditorArgs) {
  const editorConfig: CreateEditorArgs = Object.assign({}, defaultEditorConfig, config)
  const editor = createHeadlessEditor(editorConfig)

  return editor
}

export const assertTransform = function (
  editor: LexicalEditor,
  registerTransforms: (editor: LexicalEditor) => void,
  before: object,
  after: object,
) {
  const serializedBefore = JSON.stringify(before)

  const beforeState = editor.parseEditorState(serializedBefore)
  editor.setEditorState(beforeState)

  registerTransforms(editor)

  editor.update(() => {}, { discrete: true })

  const afterState = JSON.parse(JSON.stringify(editor.getEditorState().toJSON())) as unknown

  // Compare semantics, not key-level byte shape: the expected fixture round-
  // trips through the same parse→export pipeline, so serializer-owned keys
  // (checked/direction/mode defaults) line up on both sides regardless of the
  // installed Lexical version's export conventions.
  const expectedState = JSON.parse(JSON.stringify(editor.parseEditorState(JSON.stringify(after)).toJSON())) as unknown

  assert.deepEqual(afterState, expectedState)
}
