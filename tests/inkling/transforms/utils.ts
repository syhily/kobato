import type { CreateEditorArgs, LexicalEditor, LexicalNodeConfig } from 'lexical'

import { createHeadlessEditor } from '@lexical/headless'
import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import assert from 'node:assert/strict'

import { DEFAULT_NODES } from '@/inkling/nodes/base'

export const defaultNodes: LexicalNodeConfig[] = [
  // basic HTML nodes
  HeadingNode,
  LinkNode,
  ListItemNode,
  ListNode,
  QuoteNode,

  // Inkling nodes
  ...DEFAULT_NODES,
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

  // - setEditorState does not trigger transforms as expected
  //   so we need to register them here instead then they are called as they're registers
  registerTransforms(editor)

  // trigger a discrete update to make sure we're comparing finalised editor state
  // because the transforms get batched and run "async"
  editor.update(() => {}, { discrete: true })

  // Normalize through the persisted form: Lexical 0.51+ schema-driven export
  // leaves undefined-valued keys on the plain object, which JSON.stringify drops.
  const afterState = JSON.parse(JSON.stringify(editor.getEditorState().toJSON())) as unknown

  // Compare semantics, not key-level byte shape: the expected fixture round-
  // trips through the same parse→export pipeline, so serializer-owned keys
  // (checked/direction/mode defaults) line up on both sides regardless of the
  // installed Lexical version's export conventions.
  const expectedState = JSON.parse(JSON.stringify(editor.parseEditorState(JSON.stringify(after)).toJSON())) as unknown

  assert.deepEqual(afterState, expectedState)
}
