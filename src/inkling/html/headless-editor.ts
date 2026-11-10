import type { CreateEditorArgs, LexicalEditor, LexicalNodeConfig, SerializedEditorState } from 'lexical'

import { createHeadlessEditor } from '@lexical/headless'

import { DEFAULT_HTML_NODES } from '@/inkling/html/default-html-nodes'
import { DEFAULT_CONFIG } from '@/inkling/nodes/base'
import { registerRemoveAtLinkNodesTransform } from '@/inkling/transforms'

// The one headless-editor factory for the HTML surface (renderer, plain-text
// leg, importer). The node-merge policy is named because the two semantics
// differ on purpose:
//
// - 'additive' (renderer, plain text): the caller's nodes are registered
//   AFTER the complete Inkling HTML defaults, so a same-type custom entry
//   wins (Lexical keeps the last registration per type).
// - 'wholesale' (importer): the caller's editorConfig replaces the defaults
//   — nothing is merged. Do NOT unify these.

/**
 * The headless surface's default error sink: swallows errors (the renderer's
 * pinned behavior) instead of falling back to upstream's console.error. Every
 * leg applies it unless the caller passes its own onError — server callers
 * should pass one and fail fast.
 */
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
      // A caller's own onError wins.
      onError: spec.onError ?? defaultOnError,
    })
  }

  const defaultEditorConfig = {
    nodes: [...DEFAULT_HTML_NODES],
    html: DEFAULT_CONFIG.html,
    // Object.assign below still lets editorConfig.onError win.
    onError: defaultOnError,
  }
  return createHeadlessEditor(Object.assign({}, defaultEditorConfig, spec.editorConfig))
}

/**
 * The pre-render recipe both render legs (HTML, plain text) run: an additive
 * headless editor with the state loaded and the cleanup transforms registered
 * — in-progress at-link search nodes never render. Shared so a new cleanup
 * transform lands for both legs at once.
 */
export function prepareHeadlessRenderEditor(
  state: SerializedEditorState | string,
  { nodes, onError }: { nodes?: LexicalNodeConfig[]; onError?: (error: Error) => void } = {},
): LexicalEditor {
  const editor = createHeadlessHtmlEditor({ merge: 'additive', nodes, onError })
  editor.setEditorState(editor.parseEditorState(state))
  registerRemoveAtLinkNodesTransform(editor)
  return editor
}
