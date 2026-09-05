import type { CreateEditorArgs, LexicalEditor, LexicalNodeConfig, SerializedEditorState } from 'lexical'

import { createHeadlessEditor } from '@lexical/headless'

import { DEFAULT_HTML_NODES } from '@/html/default-html-nodes'
import { DEFAULT_CONFIG } from '@/nodes/base'
import { registerRemoveAtLinkNodesTransform } from '@/transforms'

// The one headless-editor factory for the HTML surface (CONTEXT.md:
// "headless HTML surface"): the renderer, the plain-text leg, and the
// importer shared three copies of "create a headless editor over
// DEFAULT_HTML_NODES (+ extras)". The node-merge policy is now NAMED
// instead of comment-carried — the two semantics differ on purpose:
//
// - 'additive' (renderer, plain-text): the caller's nodes are registered
//   AFTER the complete Inkling HTML defaults, so a same-type custom entry
//   wins (Lexical keeps the last registration per type).
// - 'wholesale' (importer): the caller's editorConfig replaces the defaults
//   — nothing is merged. Do NOT "unify" these.

/**
 * The headless surface's default error sink: swallows errors (the
 * renderer's pinned behavior) instead of falling back to upstream's
 * console.error. Every leg applies it unless the caller passes its own
 * onError — server callers should pass one and fail fast.
 */
export function defaultOnError(error: Error) {
  void error
  // do nothing
}

export type HeadlessEditorSpec =
  | { merge: 'additive'; nodes?: LexicalNodeConfig[]; onError?: (error: Error) => void }
  | { merge: 'wholesale'; editorConfig?: CreateEditorArgs }

export function createHeadlessHtmlEditor(spec: HeadlessEditorSpec): LexicalEditor {
  if (spec.merge === 'additive') {
    return createHeadlessEditor({
      nodes: [...DEFAULT_HTML_NODES, ...(spec.nodes ?? [])],
      onError: spec.onError,
    })
  }

  const defaultEditorConfig = {
    nodes: [...DEFAULT_HTML_NODES],
    html: DEFAULT_CONFIG.html,
    // The importer leg gets the same swallow-by-default onError as the two
    // render legs; Object.assign below still lets editorConfig.onError win.
    onError: defaultOnError,
  }
  return createHeadlessEditor(Object.assign({}, defaultEditorConfig, spec.editorConfig))
}

/**
 * The pre-render recipe both render legs (HTML, plain text) run: an
 * additive headless editor with the state loaded and the cleanup
 * transforms registered — in-progress at-link search nodes never render.
 * Kept here so a future cleanup transform lands for both legs at once
 * (the parity used to be comment-carried between the two call sites).
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
