import type { CreateEditorArgs, LexicalEditor, LexicalNodeConfig, SerializedEditorState } from 'lexical'

import { DEFAULT_HTML_NODES } from '@kobato/inkling-internal/html/default-html-nodes'
import { DEFAULT_CONFIG } from '@kobato/inkling-internal/nodes/base'
import { registerRemoveAtLinkNodesTransform } from '@kobato/inkling-internal/transforms'
import { createHeadlessEditor } from '@lexical/headless'

// The one headless-editor factory for the HTML surface (renderer, plain-text
// leg, importer). The node-merge policy is named because the two semantics
// differ on purpose:
//
// - 'additive' (renderer, plain text): the caller's nodes are registered
//   AFTER the complete Inkling HTML defaults, so a same-type custom entry
//   wins (Lexical keeps the last registration per type).
// - 'wholesale' (importer): the caller's editorConfig replaces the defaults
//   — nothing is merged. Do NOT unify these.

export function defaultOnError(error: Error) {
  void error
}

export type HeadlessEditorSpec =
  | { merge: 'additive'; nodes?: LexicalNodeConfig[]; onError?: (error: Error) => void }
  | { merge: 'wholesale'; editorConfig?: CreateEditorArgs }

export function createHeadlessHtmlEditor(spec: HeadlessEditorSpec): LexicalEditor {
  if (spec.merge === 'additive') {
    return createHeadlessEditor({
      nodes: [...DEFAULT_HTML_NODES, ...(spec.nodes ?? [])],
      onError: spec.onError ?? defaultOnError,
    })
  }

  const defaultEditorConfig = {
    nodes: [...DEFAULT_HTML_NODES],
    html: DEFAULT_CONFIG.html,
    onError: defaultOnError,
  }
  return createHeadlessEditor(Object.assign({}, defaultEditorConfig, spec.editorConfig))
}

export function prepareHeadlessRenderEditor(
  state: SerializedEditorState | string,
  { nodes, onError }: { nodes?: LexicalNodeConfig[]; onError?: (error: Error) => void } = {},
): LexicalEditor {
  const editor = createHeadlessHtmlEditor({ merge: 'additive', nodes, onError })
  editor.setEditorState(editor.parseEditorState(state))
  registerRemoveAtLinkNodesTransform(editor)
  return editor
}
